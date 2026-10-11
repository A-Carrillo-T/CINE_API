const stripe = require("stripe")(
  process.env.STRIPE_SECRET_KEY
);

module.exports = (db) => {

  const HOLD_MINUTES = parseInt(
    process.env.SALE_HOLD_MINUTES || "10",
    10
  );


  return async function expirePendingSales() {

    const limite = new Date(
      Date.now() - HOLD_MINUTES * 60 * 1000
    );

    try {

      // =====================================================
      // BUSCAR VENTAS PENDIENTES QUE YA PASARON EL TIEMPO
      // =====================================================

      const ventasPendientes = await db.sales.findAll({

        where: {

          status: "pending",

          saleDate: {
            [db.Sequelize.Op.lt]: limite
          }

        }

      });


      // =====================================================
      // PROCESAR UNA POR UNA
      // =====================================================

      for (const venta of ventasPendientes) {

        const t =
          await db.sequelize.transaction();


        try {

          // =================================================
          // BLOQUEAR Y VOLVER A CONSULTAR LA VENTA
          // =================================================

          const sale =
            await db.sales.findByPk(
              venta.id,
              {
                transaction: t,
                lock: t.LOCK.UPDATE
              }
            );


          // Puede haber sido pagada por el webhook
          // mientras iniciábamos este proceso
          if (
            !sale ||
            sale.status !== "pending"
          ) {

            await t.commit();
            continue;

          }


          // =================================================
          // BUSCAR PAGO
          // =================================================

          const payment =
            await db.payments.findOne({

              where: {
                saleId: sale.id
              },

              transaction: t,
              lock: t.LOCK.UPDATE

            });


          let pagoConfirmado = false;
          let stripeIntent = null;


          // =================================================
          // 1. VERIFICAR ESTADO LOCAL
          // =================================================

          if (
            payment &&
            payment.status === "completed"
          ) {

            pagoConfirmado = true;

          }


          // =================================================
          // 2. VERIFICAR DIRECTAMENTE CON STRIPE
          // =================================================

          if (
            !pagoConfirmado &&
            payment &&
            payment.stripePaymentIntentId
          ) {

            try {

              stripeIntent =
                await stripe.paymentIntents.retrieve(
                  payment.stripePaymentIntentId
                );


              console.log(
                `[expireSales] Venta ${sale.id} - Stripe: ${stripeIntent.status}`
              );


              // =============================================
              // PAGO REALMENTE COMPLETADO
              // =============================================

              if (
                stripeIntent.status === "succeeded"
              ) {

                pagoConfirmado = true;

              }


              // =============================================
              // PAGO TODAVÍA EN PROCESO
              // NO EXPIRAR
              // =============================================

              else if (
                stripeIntent.status === "processing" ||
                stripeIntent.status === "requires_action"
              ) {

                console.log(
                  `[expireSales] Venta ${sale.id} tiene un pago en proceso. No se expira.`
                );

                await t.commit();

                continue;

              }

            } catch (stripeError) {

              // MUY IMPORTANTE:
              // Si Stripe no responde, NO destruimos la venta.
              // Podría estar pagada y simplemente haber un
              // problema temporal de conexión.

              console.error(
                `[expireSales] No se pudo verificar Stripe para venta ${sale.id}:`,
                stripeError.message
              );


              await t.rollback();

              continue;

            }

          }


          // =================================================
          // SI STRIPE DICE QUE ESTÁ PAGADA
          // REPARAR LA BASE DE DATOS
          // =================================================

          if (pagoConfirmado) {

            // -----------------------------------------------
            // PAYMENT
            // -----------------------------------------------

            if (payment) {

              payment.status =
                "completed";

              await payment.save({
                transaction: t
              });

            }


            // -----------------------------------------------
            // SALE
            // -----------------------------------------------

            sale.status = "paid";

            await sale.save({
              transaction: t
            });


            // -----------------------------------------------
            // FOOD ORDER
            // -----------------------------------------------

            const foodOrder =
              await db.foodOrders.findOne({

                where: {
                  saleId: sale.id
                },

                transaction: t,
                lock: t.LOCK.UPDATE

              });


            if (
              foodOrder &&
              foodOrder.status === "pending_payment"
            ) {

              foodOrder.status = "paid";
              foodOrder.paidAt =
                foodOrder.paidAt || new Date();

              foodOrder.cancelledAt = null;


              await foodOrder.save({
                transaction: t
              });

            }


            await t.commit();


            console.log(
              `[expireSales] Venta ${sale.id} estaba pagada en Stripe. Se conservó como PAID.`
            );


            continue;

          }


          // =================================================
          // SI EXISTE PAYMENT INTENT SIN PAGAR,
          // CANCELARLO ANTES DE LIBERAR LA VENTA
          // =================================================

          if (
            stripeIntent &&
            (
              stripeIntent.status ===
                "requires_payment_method" ||

              stripeIntent.status ===
                "requires_confirmation"
            )
          ) {

            try {

              await stripe.paymentIntents.cancel(
                stripeIntent.id
              );


              console.log(
                `[expireSales] PaymentIntent ${stripeIntent.id} cancelado por vencimiento.`
              );

            } catch (cancelError) {

              // Si no logramos cancelarlo, NO destruimos
              // los tickets. Evitamos que alguien pague
              // después de que los asientos fueron liberados.

              console.error(
                `[expireSales] No se pudo cancelar PaymentIntent de venta ${sale.id}:`,
                cancelError.message
              );


              await t.rollback();

              continue;

            }

          }


          // =================================================
          // AHORA SÍ:
          // LA VENTA REALMENTE NO ESTÁ PAGADA
          // =================================================


          // =================================================
          // ORDEN DE COMIDA
          // =================================================

          const foodOrder =
            await db.foodOrders.findOne({

              where: {
                saleId: sale.id
              },

              transaction: t,
              lock: t.LOCK.UPDATE

            });


          // =================================================
          // DEVOLVER STOCK
          // =================================================

          if (
            foodOrder &&
            foodOrder.status ===
              "pending_payment"
          ) {

            const items =
              await db.saleFoodItems.findAll({

                where: {
                  foodOrderId:
                    foodOrder.id
                },

                transaction: t

              });


            for (const item of items) {

              const food =
                await db.foods.findByPk(
                  item.foodId,
                  {
                    transaction: t,
                    lock: t.LOCK.UPDATE
                  }
                );


              if (food) {

                food.stock =
                  Number(food.stock) +
                  Number(item.quantity);


                await food.save({
                  transaction: t
                });

              }

            }


            foodOrder.status =
              "cancelled";

            foodOrder.cancelledAt =
              new Date();


            await foodOrder.save({
              transaction: t
            });

          }


          // =================================================
          // LIBERAR ASIENTOS
          // =================================================

          await db.tickets.destroy({

            where: {
              saleId: sale.id
            },

            transaction: t

          });


          // =================================================
          // PAYMENT
          // =================================================

          if (
            payment &&
            payment.status === "pending"
          ) {

            payment.status = "failed";

            await payment.save({
              transaction: t
            });

          }


          // =================================================
          // EXPIRAR VENTA
          // =================================================

          sale.status = "expired";


          await sale.save({
            transaction: t
          });


          await t.commit();


          console.log(
            `[expireSales] Venta ${sale.id} expirada correctamente.`
          );


        } catch (error) {

          if (!t.finished) {
            await t.rollback();
          }


          console.error(
            `[expireSales] Error procesando venta ${venta.id}:`,
            error.message
          );

        }

      }


    } catch (error) {

      console.error(
        "[expireSales] Error general:",
        error.message
      );

    }

  };

};