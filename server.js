const dotenv = require("dotenv");

const envFile =
  process.env.NODE_ENV === "production"
    ? ".env.production"
    : ".env.development";

dotenv.config({ path: envFile });

const express = require("express");
const cors = require("cors");

const app = express();


// ======================================================
// CORS
// ======================================================

const corsOptions = {
  origin: process.env.CORS_ORIGIN || "http://localhost:3000"
};

app.use(cors(corsOptions));


// ======================================================
// STRIPE WEBHOOK
// IMPORTANTE: DEBE IR ANTES DE express.json()
// ======================================================

app.post(
  "/api/pago/webhook",
  express.raw({ type: "application/json" }),
  require("./app/controllers/pago.controller.js").webhook
);


// ======================================================
// PARSERS PARA EL RESTO DE LA API
// ======================================================

app.use(express.json());

app.use(
  express.urlencoded({
    extended: true
  })
);


// ======================================================
// BASE DE DATOS
// ======================================================

const db = require("./app/models");

db.sequelize.sync();

app.use((req, res, next) => {

  console.log("============== REQUEST ==============");
  console.log("URL:", req.url);
  console.log("METHOD:", req.method);
  console.log("CONTENT-TYPE:", req.headers["content-type"]);
  console.log("BODY:", req.body);
  console.log("=====================================");

  next();

});


// ======================================================
// RUTAS DE COMIDA
// ======================================================

const foodRoutes = require("./app/routes/food.routes");
const foodCategoryRoutes = require("./app/routes/foodCategory.routes");
const foodOrderRoutes = require("./app/routes/foodOrder.routes");

app.use("/api/foods", foodRoutes);
app.use("/api/food-categories", foodCategoryRoutes);
app.use("/api/food-orders", foodOrderRoutes
);


// ======================================================
// JOB VENTAS PENDIENTES
// ======================================================

const expirePendingSales =
  require("./app/jobs/expireSales.job.js")(db);

setInterval(expirePendingSales, 60 * 1000);

expirePendingSales();


// ======================================================
// RUTA PRINCIPAL
// ======================================================

app.get("/", (req, res) => {

  res.json({
    message: "DERCAS - Cine API",
    ambiente: process.env.NODE_ENV || "development"
  });

});


// ======================================================
// RUTAS EXISTENTES
// ======================================================

require("./app/routes/auth.route")(app);
require("./app/routes/movie.route")(app);
require("./app/routes/genre.route")(app);
require("./app/routes/cinema.route")(app);
require("./app/routes/room.route")(app);
require("./app/routes/seat.route")(app);
require("./app/routes/show.route")(app);
require("./app/routes/promotion.route")(app);
require("./app/routes/sale.route")(app);
require("./app/routes/pago.route")(app);
require("./app/routes/review.route")(app);


// ======================================================
// SERVIDOR
// ======================================================

const PORT = process.env.PORT || 8081;

app.listen(PORT, () => {

  console.log(
    `Server is running on port ${PORT} [ambiente: ${
      process.env.NODE_ENV || "development"
    }].`
  );

});