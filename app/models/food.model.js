module.exports = (sequelize, Sequelize) => {
  const Food = sequelize.define(
    "food",
    {
      name: {
        type: Sequelize.STRING,
        allowNull: false
      },

      description: {
        type: Sequelize.TEXT
      },

      price: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: false
      },

      imageUrl: {
        type: Sequelize.STRING
      },

      stock: {
        type: Sequelize.INTEGER,
        defaultValue: 0
      },

      status: {
        type: Sequelize.BOOLEAN,
        defaultValue: true
      }
    },
    {
      tableName: "food"
    }
  );

  return Food;
};