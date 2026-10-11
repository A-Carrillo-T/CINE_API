
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const db = require("../models");





exports.crearPaymentIntent = async (req, res) => {
  try {
    const { saleId } = req.body;

    if (!saleId) {
      return res.status(400).send({
        message: "saleId es requerido."
      });
    }

    // =====================================================
    // BUSCAR VENTA
    // =====================================================

    const sale = await db.sales.findByPk(saleId, {
      include: [
        {
          model: db.tickets,
          include: [db.seats, db.shows]
        }
      ]
    });

    if (!sale) {
      return res.status(404).send({
        message: `Venta con id=${saleId} no encontrada.`
      });
    }

    // =====================================================
    // VALIDAR PROPIETARIO
    // =====================================================

    if (Number(sale.userId) !== Number(req.userId)) {
      return res.status(403).send({
        message: "No tienes permiso para pagar esta venta."
      });
    }

    // =====================================================
    // VALIDAR ESTADO
    // =====================================================

    if (sale.status !== "pending") {
      return res.status(409).send({
        message: `Esta venta ya se encuentra en estado "${sale.status}".`
      });
    }

    // =====================================================
    // VALIDAR TIEMPO DE RESERVA
    // =====================================================

    const holdMinutes = parseInt(
      process.env.SALE_HOLD_MINUTES || "10",
      10
    );

    const vencidaEn = new Date(
      new Date(sale.saleDate).getTime() +
      holdMinutes * 60 * 1000
    );

    if (new Date() > vencidaEn) {
      return res.status(409).send({
        message:
          "El tiempo de reserva ya venció. Intenta la compra nuevamente."
      });
    }

    // =====================================================
    // BUSCAR PAGO EXISTENTE
    // =====================================================

    let paymentExistente = await db.payments.findOne({
      where: {
        saleId: sale.id
      }
    });

    // =====================================================
    // INTENTAR REUTILIZAR PAYMENT INTENT
    // =====================================================

    if (
      paymentExistente &&
      paymentExistente.stripePaymentIntentId
    ) {
      try {
        const intentExistente =
          await stripe.paymentIntents.retrieve(
            paymentExistente.stripePaymentIntentId
          );

        const estadosReutilizables = [
          "requires_payment_method",
          "requires_confirmation",
          "requires_action",
          "processing"
        ];

        if (
          intentExistente &&
          intentExistente.client_secret &&
          estadosReutilizables.includes(intentExistente.status)
        ) {
          console.log(
            `Reutilizando PaymentIntent ${intentExistente.id}`
          );

          return res.status(200).send({
            clientSecret: intentExistente.client_secret,
            paymentIntentId: intentExistente.id
          });
        }

        // Si Stripe dice que ya fue pagado
        if (intentExistente.status === "succeeded") {
          return res.status(200).send({
            clientSecret: intentExistente.client_secret,
            paymentIntentId: intentExistente.id,
            alreadyPaid: true
          });
        }

      } catch (err) {
        console.log(
          "PaymentIntent anterior no reutilizable:",
          err.message
        );
      }
    }

    // =====================================================
    // CALCULAR MONTO
    // =====================================================

    const montoEnCentavos = Math.round(
      parseFloat(sale.totalAmount) * 100
    );

    if (
      !Number.isFinite(montoEnCentavos) ||
      montoEnCentavos <= 0
    ) {
      return res.status(400).send({
        message: "El monto de la venta no es válido."
      });
    }

    // =====================================================
    // CREAR PAYMENT INTENT
    // =====================================================

    const paymentIntent =
      await stripe.paymentIntents.create(
        {
          amount: montoEnCentavos,
          currency: "gtq",

          payment_method_types: [
            "card"
          ],

          metadata: {
            saleId: String(sale.id),
            userId: String(req.userId)
          }
        },
        {
          // Evita PaymentIntents duplicados para la misma venta
          idempotencyKey: `sale-${sale.id}-payment`
        }
      );

    // =====================================================
    // GUARDAR / ACTUALIZAR PAYMENT
    // =====================================================

    if (paymentExistente) {

      paymentExistente.amount =
        sale.totalAmount;

      paymentExistente.status =
        "pending";

      paymentExistente.stripePaymentIntentId =
        paymentIntent.id;

      await paymentExistente.save();

      console.log(
        `Payment actualizado para venta ${sale.id}`
      );

    } else {

      const [payment] =
        await db.payments.findOrCreate({
          where: {
            saleId: sale.id
          },

          defaults: {
            amount: sale.totalAmount,
            status: "pending",
            stripePaymentIntentId:
              paymentIntent.id
          }
        });

      // Por si otro request creó el registro
      // prácticamente al mismo tiempo
      if (
        payment.stripePaymentIntentId !==
        paymentIntent.id
      ) {
        payment.amount =
          sale.totalAmount;

        payment.status =
          "pending";

        payment.stripePaymentIntentId =
          paymentIntent.id;

        await payment.save();
      }
    }

    // =====================================================
    // RESPUESTA
    // =====================================================

    return res.status(200).send({
      clientSecret:
        paymentIntent.client_secret,

      paymentIntentId:
        paymentIntent.id
    });

  } catch (error) {

    console.error(
      "======================================"
    );

    console.error(
      "ERROR CREANDO PAYMENT INTENT"
    );

    console.error(error);

    // Nos mostrará mejor los errores de Sequelize
    if (error.errors) {
      error.errors.forEach((e) => {
        console.error(
          "CAMPO:",
          e.path,
          "| MENSAJE:",
          e.message,
          "| VALOR:",
          e.value
        );
      });
    }

    console.error(
      "======================================"
    );

    return res.status(500).send({
      message:
        error.message ||
        "Error al crear el Payment Intent."
    });
  }
};


exports.webhook = async (req, res) => {

  const sig =
    req.headers["stripe-signature"];


  let evento;


  try {

    evento =
      stripe.webhooks.constructEvent(
        req.body,
        sig,
        process.env.STRIPE_WEBHOOK_SECRET
      );

  } catch (err) {

    return res
      .status(400)
      .send(
        `Webhook Error: ${err.message}`
      );

  }


  try {

    // =================================================
    // PAGO EXITOSO
    // =================================================

    if (
      evento.type ===
      "payment_intent.succeeded"
    ) {

      const paymentIntent =
        evento.data.object;


      const t =
        await db.sequelize.transaction();


      try {

        const payment =
          await db.payments.findOne({

            where: {
              stripePaymentIntentId:
                paymentIntent.id
            },

            transaction: t,
            lock: t.LOCK.UPDATE

          });


        if (!payment) {

          await t.rollback();

          console.log(
            "Webhook recibido sin pago registrado:",
            paymentIntent.id
          );


          return res
            .status(200)
            .send({
              received: true
            });

        }


        // Pago
        payment.status = "completed";

        await payment.save({
          transaction: t
        });


        // Venta
        const sale =
          await db.sales.findByPk(
            payment.saleId,
            {
              transaction: t,
              lock: t.LOCK.UPDATE
            }
          );


        if (sale) {

          sale.status = "paid";

          await sale.save({
            transaction: t
          });

        }


        // Orden de comida
        const foodOrder =
          await db.foodOrders.findOne({

            where: {
              saleId: payment.saleId
            },

            transaction: t,
            lock: t.LOCK.UPDATE

          });


        if (
          foodOrder &&
          foodOrder.status === "pending_payment"
        ) {

          foodOrder.status = "paid";
          foodOrder.paidAt = new Date();

          await foodOrder.save({
            transaction: t
          });

        }


        await t.commit();


        console.log(
          `Venta ${payment.saleId} pagada correctamente.`
        );

      } catch (error) {

        await t.rollback();

        throw error;

      }

    }


    // =================================================
    // PAGO FALLIDO
    // =================================================

    else if (
      evento.type ===
      "payment_intent.payment_failed"
    ) {

      const paymentIntent =
        evento.data.object;


      const payment =
        await db.payments.findOne({

          where: {
            stripePaymentIntentId:
              paymentIntent.id
          }

        });


      if (payment) {

        payment.status = "failed";

        await payment.save();

      }

    }


    else {

      console.log(
        `Evento de Stripe no manejado: ${evento.type}`
      );

    }


    res.status(200).send({
      received: true
    });


  } catch (error) {

    console.error(
      "Error procesando webhook:",
      error
    );


    res.status(500).send({
      message:
        "Error procesando webhook de Stripe."
    });

  }

};