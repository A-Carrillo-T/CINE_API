const db = require("../models");

const Food = db.foods;
const FoodCategory = db.foodCategories;


// =====================================================
// OBTENER TODAS LAS COMIDAS
// =====================================================

exports.findAll = async (req, res) => {
  try {

    const foods = await Food.findAll({
      include: [
        {
          model: FoodCategory,
          attributes: ["id", "name", "description"]
        }
      ],
      order: [["id", "ASC"]]
    });

    res.json(foods);

  } catch (error) {

    console.error("Error al obtener comidas:", error);

    res.status(500).json({
      message: "Error al obtener las comidas",
      error: error.message
    });

  }
};


// =====================================================
// OBTENER UNA COMIDA
// =====================================================

exports.findOne = async (req, res) => {

  try {

    const id = req.params.id;

    const food = await Food.findByPk(id, {
      include: [
        {
          model: FoodCategory,
          attributes: ["id", "name", "description"]
        }
      ]
    });

    if (!food) {

      return res.status(404).json({
        message: "Comida no encontrada"
      });

    }

    res.json(food);

  } catch (error) {

    console.error("Error al obtener comida:", error);

    res.status(500).json({
      message: "Error al obtener la comida",
      error: error.message
    });

  }
};


// =====================================================
// CREAR COMIDA
// =====================================================

exports.create = async (req, res) => {

  try {

    const {
      name,
      description,
      price,
      imageUrl,
      stock,
      status,
      categoryId
    } = req.body;


    // Validar campos obligatorios

    if (!name) {

      return res.status(400).json({
        message: "El nombre de la comida es obligatorio"
      });

    }

    if (price === undefined || price === null) {

      return res.status(400).json({
        message: "El precio es obligatorio"
      });

    }

    if (!categoryId) {

      return res.status(400).json({
        message: "La categoría es obligatoria"
      });

    }


    // Verificar categoría

    const category = await FoodCategory.findByPk(categoryId);

    if (!category) {

      return res.status(404).json({
        message: "La categoría indicada no existe"
      });

    }


    // Crear comida

    const food = await Food.create({
      name,
      description,
      price,
      imageUrl,
      stock,
      status,
      categoryId
    });


    res.status(201).json({

      message: "Comida creada correctamente",

      food

    });

  } catch (error) {

    console.error("Error al crear comida:", error);

    res.status(500).json({

      message: "Error al crear la comida",

      error: error.message

    });

  }

};


// =====================================================
// ACTUALIZAR COMIDA
// =====================================================

exports.update = async (req, res) => {

  try {

    const id = req.params.id;

    const food = await Food.findByPk(id);

    if (!food) {

      return res.status(404).json({
        message: "Comida no encontrada"
      });

    }


    const {
      name,
      description,
      price,
      imageUrl,
      stock,
      status,
      categoryId
    } = req.body;


    // Si mandaron categoryId, verificarla

    if (categoryId) {

      const category = await FoodCategory.findByPk(categoryId);

      if (!category) {

        return res.status(404).json({
          message: "La categoría indicada no existe"
        });

      }

    }


    await food.update({

      name,
      description,
      price,
      imageUrl,
      stock,
      status,
      categoryId

    });


    res.json({

      message: "Comida actualizada correctamente",

      food

    });

  } catch (error) {

    console.error("Error al actualizar comida:", error);

    res.status(500).json({

      message: "Error al actualizar la comida",

      error: error.message

    });

  }

};


// =====================================================
// ELIMINAR COMIDA
// =====================================================

exports.delete = async (req, res) => {

  try {

    const id = req.params.id;

    const food = await Food.findByPk(id);

    if (!food) {

      return res.status(404).json({

        message: "Comida no encontrada"

      });

    }


    await food.destroy();


    res.json({

      message: "Comida eliminada correctamente"

    });

  } catch (error) {

    console.error("Error al eliminar comida:", error);

    res.status(500).json({

      message: "Error al eliminar la comida",

      error: error.message

    });

  }

};