module.exports = (sequelize, Sequelize) => {

  const FoodOrder = sequelize.define(
    "foodOrder",
    {
      orderCode: {
        type: Sequelize.STRING(50),
        allowNull: false,
        unique: true
      },

      status: {
        type: Sequelize.STRING(30),
        allowNull: false,
        defaultValue: "pending_payment",
        validate: {
          isIn: [[
            "pending_payment",
            "paid",
            "delivered",
            "cancelled",
            "refunded"
          ]]
        }
      },

      paidAt: {
        type: Sequelize.DATE,
        allowNull: true
      },

      deliveredAt: {
        type: Sequelize.DATE,
        allowNull: true
      },

      cancelledAt: {
        type: Sequelize.DATE,
        allowNull: true
      }
    },
    {
      tableName: "foodOrders"
    }
  );

  return FoodOrder;
};