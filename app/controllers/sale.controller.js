const crypto = require("crypto");

const db = require("../models");
const Op = db.Sequelize.Op;


// =====================================================
// CREAR VENTA
// BOLETOS + COMIDA
// =====================================================

exports.create = async (req, res) => {

  const {
    showId,
    seatIds,
    promotionId,
    foodItems = []
  } = req.body;


  // ---------------------------------------------------
  // VALIDACIONES GENERALES
  // ---------------------------------------------------

  if (
    !showId ||
    !Array.isArray(seatIds) ||
    seatIds.length === 0
  ) {
    return res.status(400).send({
      message:
        "showId y un arreglo seatIds no vacío son requeridos."
    });
  }


  // No permitir asientos duplicados
  const seatIdsNormalizados = seatIds.map(Number);
  const seatIdsUnicos = [...new Set(seatIdsNormalizados)];

  if (seatIdsUnicos.length !== seatIdsNormalizados.length) {
    return res.status(400).send({
      message: "No puedes seleccionar un asiento más de una vez."
    });
  }


  // ---------------------------------------------------
  // VALIDAR COMIDA
  // ---------------------------------------------------

  if (!Array.isArray(foodItems)) {
    return res.status(400).send({
      message: "foodItems debe ser un arreglo."
    });
  }


  // Agrupar por foodId por si el frontend manda
  // el mismo producto más de una vez.
  const comidaAgrupada = new Map();

  for (const item of foodItems) {

    const foodId = Number(item.foodId);
    const quantity = Number(item.quantity);

    if (
      !Number.isInteger(foodId) ||
      !Number.isInteger(quantity) ||
      quantity <= 0
    ) {
      return res.status(400).send({
        message:
          "Cada producto debe tener foodId válido y quantity mayor a 0."
      });
    }

    comidaAgrupada.set(
      foodId,
      (comidaAgrupada.get(foodId) || 0) + quantity
    );
  }


  const comidaSolicitada =
    Array.from(comidaAgrupada.entries()).map(
      ([foodId, quantity]) => ({
        foodId,
        quantity
      })
    );


  const t = await db.sequelize.transaction();


  try {

    // =================================================
    // FUNCIÓN
    // =================================================

    const show = await db.shows.findByPk(showId, {
      transaction: t
    });

    if (!show) {

      await t.rollback();

      return res.status(404).send({
        message:
          `Función con id=${showId} no encontrada.`
      });
    }


    if (!show.status) {

      await t.rollback();

      return res.status(409).send({
        message: "Esta función no está disponible."
      });
    }


    // =================================================
    // VALIDAR QUE LOS ASIENTOS SEAN DE ESA SALA
    // =================================================

    const asientosValidos = await db.seats.findAll({
      where: {
        id: {
          [Op.in]: seatIdsUnicos
        },
        roomId: show.roomId
      },
      transaction: t
    });


    if (asientosValidos.length !== seatIdsUnicos.length) {

      await t.rollback();

      return res.status(400).send({
        message:
          "Uno o más asientos no pertenecen a la sala de esta función."
      });
    }


    // =================================================
    // VERIFICAR ASIENTOS OCUPADOS
    // =================================================

    const asientosOcupados = await db.tickets.findAll({

      where: {
        showId: showId,
        seatId: {
          [Op.in]: seatIdsUnicos
        }
      },

      transaction: t,
      lock: t.LOCK.UPDATE
    });


    if (asientosOcupados.length > 0) {

      await t.rollback();

      return res.status(409).send({

        message:
          "Uno o más asientos seleccionados ya fueron vendidos o reservados.",

        seatIdsOcupados:
          asientosOcupados.map(ticket => ticket.seatId)

      });
    }


    // =================================================
    // PRECIO DE BOLETOS
    // =================================================

    let precioUnitario = Number(show.basePrice);


    if (promotionId) {

      const promotion =
        await db.promotions.findByPk(
          promotionId,
          {
            transaction: t
          }
        );


      const now = new Date();


      const promoVigente =
        promotion &&
        promotion.status &&
        (
          !promotion.validFrom ||
          promotion.validFrom <= now
        ) &&
        (
          !promotion.validTo ||
          promotion.validTo >= now
        );


      if (promoVigente) {

        precioUnitario =
          precioUnitario *
          (
            1 -
            Number(promotion.discountPercentage) / 100
          );

      }

    }


    // Redondear
    precioUnitario =
      Math.round(precioUnitario * 100) / 100;


    const ticketsTotal =
      Math.round(
        precioUnitario *
        seatIdsUnicos.length *
        100
      ) / 100;


    // =================================================
    // VALIDAR COMIDA Y STOCK
    // =================================================

    let foodTotal = 0;

    const productosParaOrden = [];


    if (comidaSolicitada.length > 0) {

      const foodIds =
        comidaSolicitada.map(item => item.foodId);


      const foods = await db.foods.findAll({

        where: {
          id: {
            [Op.in]: foodIds
          }
        },

        transaction: t,
        lock: t.LOCK.UPDATE

      });


      if (foods.length !== foodIds.length) {

        await t.rollback();

        return res.status(400).send({
          message:
            "Uno o más productos de comida no existen."
        });
      }


      const foodsMap = new Map(
        foods.map(food => [food.id, food])
      );


      for (const item of comidaSolicitada) {

        const food =
          foodsMap.get(item.foodId);


        if (!food.status) {

          await t.rollback();

          return res.status(409).send({
            message:
              `"${food.name}" no está disponible actualmente.`
          });
        }


        if (food.stock < item.quantity) {

          await t.rollback();

          return res.status(409).send({
            message:
              `No hay suficiente stock de "${food.name}".`,
            stockDisponible: food.stock
          });
        }


        const unitPrice =
          Number(food.price);


        const subtotal =
          Math.round(
            unitPrice *
            item.quantity *
            100
          ) / 100;


        foodTotal += subtotal;


        productosParaOrden.push({
          food,
          quantity: item.quantity,
          unitPrice,
          subtotal
        });

      }

    }


    foodTotal =
      Math.round(foodTotal * 100) / 100;


    const totalAmount =
      Math.round(
        (ticketsTotal + foodTotal) * 100
      ) / 100;


    // =================================================
    // CREAR VENTA
    // =================================================

    const sale = await db.sales.create({

      userId: req.userId,
      totalAmount,
      status: "pending"

    }, {
      transaction: t
    });


    // =================================================
    // CREAR BOLETOS
    // =================================================

    const tickets =
      await db.tickets.bulkCreate(

        seatIdsUnicos.map(seatId => ({

          saleId: sale.id,
          showId,
          seatId,
          price: precioUnitario

        })),

        {
          transaction: t
        }

      );


    // =================================================
    // CREAR ORDEN DE COMIDA
    // =================================================

    let foodOrder = null;
    let createdFoodItems = [];


    if (productosParaOrden.length > 0) {

      const randomCode =
        crypto
          .randomBytes(3)
          .toString("hex")
          .toUpperCase();


      const orderCode =
        `FOOD-${sale.id}-${randomCode}`;


      foodOrder =
        await db.foodOrders.create(
          {
            saleId: sale.id,
            orderCode,
            status: "pending_payment"
          },
          {
            transaction: t
          }
        );


      createdFoodItems =
        await db.saleFoodItems.bulkCreate(

          productosParaOrden.map(item => ({

            foodOrderId: foodOrder.id,

            foodId: item.food.id,

            quantity: item.quantity,

            unitPrice: item.unitPrice,

            subtotal: item.subtotal

          })),

          {
            transaction: t
          }

        );


      // -----------------------------------------------
      // RESERVAR STOCK
      // -----------------------------------------------

      for (const item of productosParaOrden) {

        item.food.stock =
          item.food.stock - item.quantity;

        await item.food.save({
          transaction: t
        });

      }

    }


    await t.commit();


    // =================================================
    // TIEMPO DE RESERVA
    // =================================================

    const holdMinutes =
      parseInt(
        process.env.SALE_HOLD_MINUTES || "10",
        10
      );


    const expiresAt =
      new Date(
        new Date(sale.saleDate).getTime() +
        holdMinutes * 60 * 1000
      );


    res.status(201).send({

      message:
        "Venta creada. Completa el pago antes de que expire la reserva.",

      sale,

      tickets,

      foodOrder,

      foodItems: createdFoodItems,

      breakdown: {
        ticketsTotal,
        foodTotal,
        totalAmount
      },

      expiresAt

    });

  } catch (err) {

    if (!t.finished) {
      await t.rollback();
    }


    // Si dos clientes intentan comprar el mismo asiento
    // prácticamente al mismo tiempo.
    if (
      err.name === "SequelizeUniqueConstraintError"
    ) {

      return res.status(409).send({
        message:
          "Uno de los asientos acaba de ser reservado por otro cliente."
      });

    }


    console.error(
      "Error al crear venta:",
      err
    );


    res.status(500).send({

      message:
        err.message ||
        "Ocurrió un error al procesar la venta."

    });

  }

};


// =====================================================
// MIS VENTAS
// =====================================================

exports.findMine = (req, res) => {

  db.sales.findAll({

    where: {
      userId: req.userId
    },

    include: [

      {
        model: db.tickets,
        include: [
          db.seats,
          db.shows
        ]
      },

      {
        model: db.foodOrders,
        as: "foodOrder",
        include: [
          {
            model: db.saleFoodItems,
            as: "items",
            include: [
              {
                model: db.foods,
                as: "food"
              }
            ]
          }
        ]
      }

    ],

    order: [
      ["saleDate", "DESC"]
    ]

  })
    .then(data => res.send(data))

    .catch(err =>
      res.status(500).send({
        message:
          err.message ||
          "Ocurrió un error al obtener tus ventas."
      })
    );

};


// =====================================================
// TODAS LAS VENTAS - ADMIN
// =====================================================

exports.findAll = (req, res) => {

  db.sales.findAll({

    include: [

      db.appUsers,

      {
        model: db.tickets,
        include: [
          db.seats,
          db.shows
        ]
      },

      {
        model: db.foodOrders,
        as: "foodOrder",

        include: [
          {
            model: db.saleFoodItems,
            as: "items",

            include: [
              {
                model: db.foods,
                as: "food"
              }
            ]
          }
        ]
      }

    ],

    order: [
      ["saleDate", "DESC"]
    ]

  })
    .then(data => res.send(data))

    .catch(err =>
      res.status(500).send({
        message:
          err.message ||
          "Ocurrió un error al listar las ventas."
      })
    );

};


// =====================================================
// UNA VENTA
// =====================================================

exports.findOne = (req, res) => {

  const id = req.params.id;


  db.sales.findByPk(id, {

    include: [

      db.appUsers,

      {
        model: db.tickets,

        include: [
          db.seats,
          db.shows
        ]
      },

      db.payments,

      {
        model: db.foodOrders,
        as: "foodOrder",

        include: [
          {
            model: db.saleFoodItems,
            as: "items",

            include: [
              {
                model: db.foods,
                as: "food"
              }
            ]
          }
        ]
      }

    ]

  })
    .then(data => {

      if (!data) {

        return res.status(404).send({
          message:
            `Venta con id=${id} no encontrada.`
        });

      }


      if (
        data.userId !== req.userId &&
        req.userRole !== "admin"
      ) {

        return res.status(403).send({
          message:
            "No tienes permiso para ver esta venta."
        });

      }


      res.send(data);

    })

    .catch(err => {

      console.error(err);

      res.status(500).send({
        message:
          "Error al obtener la venta con id=" + id
      });

    });

};