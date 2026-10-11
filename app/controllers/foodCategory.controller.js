const db = require("../models");

const FoodCategory = db.foodCategories;

// Obtener todas las categorías
exports.findAll = async (req, res) => {
  try {
    const categories = await FoodCategory.findAll({
      order: [["id", "ASC"]]
    });

    res.json(categories);
  } catch (error) {
    console.error("Error al obtener categorías:", error);
    res.status(500).json({
      message: "Error al obtener las categorías",
      error: error.message
    });
  }
};


// Obtener una categoría por ID
exports.findOne = async (req, res) => {
  try {
    const id = req.params.id;

    const category = await FoodCategory.findByPk(id);

    if (!category) {
      return res.status(404).json({
        message: "Categoría no encontrada"
      });
    }

    res.json(category);
  } catch (error) {
    console.error("Error al obtener categoría:", error);

    res.status(500).json({
      message: "Error al obtener la categoría",
      error: error.message
    });
  }
};


// Crear categoría
exports.create = async (req, res) => {
  try {
    const { name, description, status } = req.body;

    if (!name) {
      return res.status(400).json({
        message: "El nombre de la categoría es obligatorio"
      });
    }

    const category = await FoodCategory.create({
      name,
      description,
      status
    });

    res.status(201).json({
      message: "Categoría creada correctamente",
      category
    });

  } catch (error) {
    console.error("Error al crear categoría:", error);

    res.status(500).json({
      message: "Error al crear la categoría",
      error: error.message
    });
  }
};


// Actualizar categoría
exports.update = async (req, res) => {
  try {
    const id = req.params.id;

    const category = await FoodCategory.findByPk(id);

    if (!category) {
      return res.status(404).json({
        message: "Categoría no encontrada"
      });
    }

    const { name, description, status } = req.body;

    await category.update({
      name,
      description,
      status
    });

    res.json({
      message: "Categoría actualizada correctamente",
      category
    });

  } catch (error) {
    console.error("Error al actualizar categoría:", error);

    res.status(500).json({
      message: "Error al actualizar la categoría",
      error: error.message
    });
  }
};


// Eliminar categoría
exports.delete = async (req, res) => {
  try {
    const id = req.params.id;

    const category = await FoodCategory.findByPk(id);

    if (!category) {
      return res.status(404).json({
        message: "Categoría no encontrada"
      });
    }

    await category.destroy();

    res.json({
      message: "Categoría eliminada correctamente"
    });

  } catch (error) {
    console.error("Error al eliminar categoría:", error);

    res.status(500).json({
      message: "Error al eliminar la categoría",
      error: error.message
    });
  }
};