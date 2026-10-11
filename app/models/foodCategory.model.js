module.exports = (sequelize, Sequelize) => {
  const FoodCategory = sequelize.define(
  "foodCategory",
  {
    // tus campos actuales
  },
  {
    tableName: "foodCategories"
  }
);

  return FoodCategory;
};