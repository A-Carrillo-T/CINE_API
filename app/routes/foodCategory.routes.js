const express = require("express");

const router = express.Router();

const controller = require("../controllers/foodCategory.controller");


// Obtener todas
router.get("/", controller.findAll);

// Obtener una
router.get("/:id", controller.findOne);

// Crear
router.post("/", controller.create);

// Actualizar
router.put("/:id", controller.update);

// Eliminar
router.delete("/:id", controller.delete);


module.exports = router;