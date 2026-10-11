const db = require("../models");

const FoodOrder = db.foodOrders;


// =====================================================
// MIS ORDENES DE COMIDA
// =====================================================

exports.findMine = async (req, res) => {

  try {

    const orders = await FoodOrder.findAll({

      include: [

        {
          model: db.sales,
          as: "sale",
          where: {
            userId: req.userId
          },
          required: true
        },

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

      ],

      order: [["createdAt", "DESC"]]

    });

    res.json(orders);

  } catch (error) {

    console.error(
      "Error al obtener órdenes:",
      error
    );

    res.status(500).json({
      message: "Error al obtener las órdenes de comida",
      error: error.message
    });

  }

};


// =====================================================
// OBTENER UNA ORDEN
// =====================================================

exports.findOne = async (req, res) => {

  try {

    const order = await FoodOrder.findByPk(
      req.params.id,
      {
        include: [

          {
            model: db.sales,
            as: "sale"
          },

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
    );


    if (!order) {

      return res.status(404).json({
        message: "Orden de comida no encontrada"
      });

    }


    if (
      order.sale.userId !== req.userId &&
      req.userRole !== "admin"
    ) {

      return res.status(403).json({
        message:
          "No tienes permiso para consultar esta orden"
      });

    }


    res.json(order);

  } catch (error) {

    res.status(500).json({
      message: "Error al consultar la orden",
      error: error.message
    });

  }

};


// =====================================================
// BUSCAR POR CODIGO
// PARA EL PERSONAL DEL CINE
// =====================================================

exports.findByCode = async (req, res) => {

  try {

    const order = await FoodOrder.findOne({

      where: {
        orderCode: req.params.orderCode
      },

      include: [

        {
          model: db.sales,
          as: "sale",

          include: [
            db.appUsers
          ]
        },

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

    });


    if (!order) {

      return res.status(404).json({
        message: "Orden no encontrada"
      });

    }


    res.json(order);

  } catch (error) {

    res.status(500).json({
      message: "Error al buscar la orden",
      error: error.message
    });

  }

};


// =====================================================
// MARCAR COMO ENTREGADA
// =====================================================

exports.markDelivered = async (req, res) => {

  const transaction =
    await db.sequelize.transaction();

  try {

    const order = await FoodOrder.findByPk(
      req.params.id,
      {
        transaction,
        lock: transaction.LOCK.UPDATE
      }
    );


    if (!order) {

      await transaction.rollback();

      return res.status(404).json({
        message: "Orden no encontrada"
      });

    }


    if (order.status === "delivered") {

      await transaction.rollback();

      return res.status(409).json({
        message:
          "Esta orden ya fue entregada anteriormente"
      });

    }


    if (order.status !== "paid") {

      await transaction.rollback();

      return res.status(409).json({
        message:
          `La orden no puede entregarse porque está en estado "${order.status}"`
      });

    }


    order.status = "delivered";
    order.deliveredAt = new Date();

    await order.save({
      transaction
    });


    await transaction.commit();


    res.json({
      message: "Pedido entregado correctamente",
      order
    });

  } catch (error) {

    await transaction.rollback();

    res.status(500).json({
      message: "Error al entregar el pedido",
      error: error.message
    });

  }

};