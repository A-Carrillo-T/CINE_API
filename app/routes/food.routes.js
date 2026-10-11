const express = require("express");

const router = express.Router();

const controller = require("../controllers/food.controller");


// Obtener todas las comidas
router.get("/", controller.findAll);

// Obtener una comida
router.get("/:id", controller.findOne);

// Crear comida
router.post("/", controller.create);

// Actualizar comida
router.put("/:id", controller.update);

// Eliminar comida
router.delete("/:id", controller.delete);


module.exports = router;