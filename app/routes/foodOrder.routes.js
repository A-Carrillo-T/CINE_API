const express = require("express");

const router = express.Router();

const controller =
  require("../controllers/foodOrder.controller");

const {
  verifyToken,
  isAdmin
} = require("../middlewares/authJwt");


// Cliente: ver sus órdenes
router.get(
  "/mine",
  [verifyToken],
  controller.findMine
);


// Admin: buscar ticket de comida
router.get(
  "/code/:orderCode",
  [verifyToken, isAdmin],
  controller.findByCode
);


// Admin: marcar pedido como entregado
router.patch(
  "/:id/deliver",
  [verifyToken, isAdmin],
  controller.markDelivered
);


// Cliente/admin: consultar una orden
router.get(
  "/:id",
  [verifyToken],
  controller.findOne
);


module.exports = router;