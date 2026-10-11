const dotenv = require("dotenv");
const bcrypt = require("bcryptjs");

const envFile =
  process.env.NODE_ENV === "production"
    ? ".env.production"
    : ".env.development";

dotenv.config({ path: envFile });

const db = require("./app/models");
const { QueryTypes } = db.Sequelize;

// ============================================================
// SEED NEBAJPOLIS
// - No borra datos existentes.
// - Puede ejecutarse varias veces sin duplicar la mayor parte
//   de los datos maestros.
// - Las ventas/pagos/tickets/foodOrders NO se precargan porque
//   deben generarse por el flujo real de compra + Stripe.
// ============================================================

function futureDate(daysFromNow, hour = 18, minute = 0) {
  const date = new Date();
  date.setDate(date.getDate() + daysFromNow);
  date.setHours(hour, minute, 0, 0);
  return date;
}

async function upsertByWhere(model, where, values) {
  const [row, created] = await model.findOrCreate({
    where,
    defaults: values
  });

  if (!created) {
    await row.update(values);
  }

  return row;
}

async function ensureFoodCategoryColumns() {
  const qi = db.sequelize.getQueryInterface();
  const table = await qi.describeTable("foodCategories");

  if (!table.name) {
    await qi.addColumn("foodCategories", "name", {
      type: db.Sequelize.STRING,
      allowNull: false,
      defaultValue: "Sin nombre"
    });
  }

  if (!table.description) {
    await qi.addColumn("foodCategories", "description", {
      type: db.Sequelize.TEXT,
      allowNull: true
    });
  }

  if (!table.status) {
    await qi.addColumn("foodCategories", "status", {
      type: db.Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: true
    });
  }
}

async function upsertFoodCategory(name, description) {
  const found = await db.sequelize.query(
    `SELECT * FROM "foodCategories" WHERE "name" = :name LIMIT 1`,
    {
      replacements: { name },
      type: QueryTypes.SELECT
    }
  );

  if (found.length > 0) {
    const id = found[0].id;

    await db.sequelize.query(
      `UPDATE "foodCategories"
       SET "description" = :description,
           "status" = TRUE,
           "updatedAt" = NOW()
       WHERE "id" = :id`,
      {
        replacements: { id, description },
        type: QueryTypes.UPDATE
      }
    );

    return id;
  }

  const inserted = await db.sequelize.query(
    `INSERT INTO "foodCategories"
      ("name", "description", "status", "createdAt", "updatedAt")
     VALUES
      (:name, :description, TRUE, NOW(), NOW())
     RETURNING "id"`,
    {
      replacements: { name, description },
      type: QueryTypes.INSERT
    }
  );

  return inserted[0][0].id;
}

const MOVIES = [
  {
    title: "Dune: Part Two",
    synopsis:
      "Paul Atreides se une a Chani y a los Fremen mientras busca venganza contra quienes destruyeron a su familia y enfrenta una decisión capaz de cambiar el destino del universo conocido.",
    durationMinutes: 166,
    releaseDate: "2024-03-01",
    rating: "PG-13",
    posterUrl:
      "https://image.tmdb.org/t/p/w500/1pdfLvkbY9ohJlCjQH2CZjjYVvJ.jpg",
    backdropUrl: null,
    originalLanguage: "English",
    genres: ["Ciencia ficción", "Aventura", "Drama"],
    cast: [
      ["Timothée Chalamet", "Paul Atreides"],
      ["Zendaya", "Chani"],
      ["Rebecca Ferguson", "Lady Jessica"],
      ["Javier Bardem", "Stilgar"]
    ]
  },
  {
    title: "Inside Out 2",
    synopsis:
      "Riley entra a la adolescencia y el cuartel general de sus emociones recibe nuevas integrantes, entre ellas Ansiedad, que cambia por completo el equilibrio de su mundo interior.",
    durationMinutes: 96,
    releaseDate: "2024-06-14",
    rating: "PG",
    posterUrl:
      "https://image.tmdb.org/t/p/w500/vpnVM9B6NMmQpWeZvzLvDESb2QY.jpg",
    backdropUrl: null,
    originalLanguage: "English",
    genres: ["Animación", "Familia", "Comedia", "Aventura"],
    cast: [
      ["Amy Poehler", "Joy / Alegría"],
      ["Maya Hawke", "Anxiety / Ansiedad"],
      ["Kensington Tallman", "Riley"],
      ["Phyllis Smith", "Sadness / Tristeza"]
    ]
  },
  {
    title: "Deadpool & Wolverine",
    synopsis:
      "Wade Wilson vuelve a ponerse el traje de Deadpool y termina formando una alianza improbable con Wolverine para enfrentar una amenaza que pone en riesgo su universo.",
    durationMinutes: 128,
    releaseDate: "2024-07-26",
    rating: "R",
    posterUrl:
      "https://image.tmdb.org/t/p/w500/8cdWjvZQUExUUTzyp4t6EDMubfO.jpg",
    backdropUrl: null,
    originalLanguage: "English",
    genres: ["Acción", "Comedia", "Ciencia ficción"],
    cast: [
      ["Ryan Reynolds", "Wade Wilson / Deadpool"],
      ["Hugh Jackman", "Logan / Wolverine"],
      ["Emma Corrin", "Cassandra Nova"],
      ["Matthew Macfadyen", "Mr. Paradox"]
    ]
  },
  {
    title: "The Wild Robot",
    synopsis:
      "Roz, una robot que naufraga en una isla salvaje, aprende a convivir con los animales del lugar y desarrolla un vínculo inesperado al cuidar de un pequeño ganso huérfano.",
    durationMinutes: 102,
    releaseDate: "2024-09-27",
    rating: "PG",
    posterUrl:
      "https://image.tmdb.org/t/p/w500/wTnV3PCVW5O92JMrFvvrRcV39RU.jpg",
    backdropUrl: null,
    originalLanguage: "English",
    genres: ["Animación", "Familia", "Aventura", "Ciencia ficción"],
    cast: [
      ["Lupita Nyong'o", "Roz"],
      ["Pedro Pascal", "Fink"],
      ["Kit Connor", "Brightbill"],
      ["Catherine O'Hara", "Pinktail"]
    ]
  },
  {
    title: "Wicked",
    synopsis:
      "Antes de convertirse en figuras legendarias de Oz, Elphaba y Glinda se conocen en la universidad y forjan una amistad que será puesta a prueba por sus decisiones y por el poder del Mago.",
    durationMinutes: 160,
    releaseDate: "2024-11-22",
    rating: "PG",
    posterUrl:
      "https://image.tmdb.org/t/p/w500/xDGbZ0JJ3mYaGKy4Nzd9Kph6M9L.jpg",
    backdropUrl: null,
    originalLanguage: "English",
    genres: ["Musical", "Fantasía", "Drama", "Romance"],
    cast: [
      ["Cynthia Erivo", "Elphaba"],
      ["Ariana Grande", "Glinda"],
      ["Jonathan Bailey", "Fiyero"],
      ["Jeff Goldblum", "The Wizard"]
    ]
  },
  {
    title: "Moana 2",
    synopsis:
      "Moana recibe una llamada de sus antepasados navegantes y emprende una nueva travesía por los mares de Oceanía junto a Maui y una tripulación inesperada.",
    durationMinutes: 100,
    releaseDate: "2024-11-27",
    rating: "PG",
    posterUrl:
      "https://image.tmdb.org/t/p/w500/aLVkiINlIeCkcZIzb7XHzPYgO6L.jpg",
    backdropUrl: null,
    originalLanguage: "English",
    genres: ["Animación", "Familia", "Aventura", "Musical"],
    cast: [
      ["Auli'i Cravalho", "Moana"],
      ["Dwayne Johnson", "Maui"],
      ["Hualālai Chung", "Moni"],
      ["Rose Matafeo", "Loto"]
    ]
  },
  {
    title: "Superman",
    synopsis:
      "Clark Kent intenta reconciliar su herencia kryptoniana con la educación humana que recibió mientras actúa como Superman y defiende un ideal de esperanza en un mundo cada vez más complejo.",
    durationMinutes: 129,
    releaseDate: "2025-07-11",
    rating: "PG-13",
    posterUrl: "https://es.web.img2.acsta.net/img/b3/3e/b33e01f98f8ca3702a3554791633fd6c.jpg",
    backdropUrl: null,
    originalLanguage: "English",
    genres: ["Acción", "Aventura", "Ciencia ficción"],
    cast: [
      ["David Corenswet", "Clark Kent / Superman"],
      ["Rachel Brosnahan", "Lois Lane"],
      ["Nicholas Hoult", "Lex Luthor"],
      ["Edi Gathegi", "Michael Holt / Mister Terrific"]
    ]
  },
  {
    title: "Jurassic World Rebirth",
    synopsis:
      "Un equipo especializado viaja a una zona aislada donde sobreviven enormes especies prehistóricas para obtener material genético capaz de impulsar un importante avance médico.",
    durationMinutes: 134,
    releaseDate: "2025-07-02",
    rating: "PG-13",
    posterUrl: null,
    backdropUrl: null,
    originalLanguage: "English",
    genres: ["Acción", "Aventura", "Ciencia ficción", "Suspenso"],
    cast: [
      ["Scarlett Johansson", "Zora Bennett"],
      ["Mahershala Ali", "Duncan Kincaid"],
      ["Jonathan Bailey", "Dr. Henry Loomis"],
      ["Rupert Friend", "Martin Krebs"]
    ]
  },
  {
    title: "How to Train Your Dragon",
    synopsis:
      "Hiccup, un joven vikingo que no encaja con las tradiciones de su pueblo, conoce al dragón Toothless y descubre que humanos y dragones pueden construir un futuro diferente.",
    durationMinutes: 126,
    releaseDate: "2025-06-13",
    rating: "PG",
    posterUrl: null,
    backdropUrl: null,
    originalLanguage: "English",
    genres: ["Aventura", "Fantasía", "Familia", "Acción"],
    cast: [
      ["Mason Thames", "Hiccup"],
      ["Nico Parker", "Astrid"],
      ["Gerard Butler", "Stoick"],
      ["Nick Frost", "Gobber"]
    ]
  },
  {
    title: "Mission: Impossible - The Final Reckoning",
    synopsis:
      "Ethan Hunt y su equipo continúan la carrera por detener a la Entidad, una inteligencia artificial capaz de alterar el equilibrio mundial, mientras enfrentan decisiones con consecuencias definitivas.",
    durationMinutes: 173,
    releaseDate: "2025-05-23",
    rating: "PG-13",
    posterUrl:
      "https://image.tmdb.org/t/p/w500/AozMgdALZuR1hDPZt2a1aXiWmL4.jpg",
    backdropUrl: null,
    originalLanguage: "English",
    genres: ["Acción", "Aventura", "Suspenso"],
    cast: [
      ["Tom Cruise", "Ethan Hunt"],
      ["Hayley Atwell", "Grace"],
      ["Ving Rhames", "Luther Stickell"],
      ["Simon Pegg", "Benji Dunn"]
    ]
  }
];

async function seed() {
  try {
    console.log(`\n[seed] Ambiente: ${process.env.NODE_ENV || "development"}`);
    console.log(`[seed] Archivo env: ${envFile}`);

    await db.sequelize.authenticate();
    console.log("[seed] Conexión a la base de datos correcta.");

    await db.sequelize.sync();
    await ensureFoodCategoryColumns();

    // ========================================================
    // USUARIOS DE PRUEBA
    // ========================================================

    const adminPassword = bcrypt.hashSync("Admin123*", 8);
    const customerPassword = bcrypt.hashSync("Cliente123*", 8);

    const admin = await upsertByWhere(
      db.appUsers,
      { email: "admin.seed@nebajpolis.local" },
      {
        fullName: "Administrador Nebajpolis",
        email: "admin.seed@nebajpolis.local",
        password: adminPassword,
        phone: "+502 5555-0101",
        role: "admin"
      }
    );

    const cliente = await upsertByWhere(
      db.appUsers,
      { email: "cliente.seed@nebajpolis.local" },
      {
        fullName: "Cliente de Prueba",
        email: "cliente.seed@nebajpolis.local",
        password: customerPassword,
        phone: "+502 5555-0102",
        role: "customer"
      }
    );

    console.log(`[seed] Usuarios listos: admin #${admin.id}, cliente #${cliente.id}`);

    // ========================================================
    // CINE, SALAS Y ASIENTOS
    // ========================================================

    const cinema = await upsertByWhere(
      db.cinemas,
      { name: "Nebajpolis Central" },
      {
        name: "Nebajpolis Central",
        address: "Zona central, Santa María Nebaj",
        city: "Nebaj, Quiché",
        phone: "+502 7777-0100"
      }
    );

    const room1 = await upsertByWhere(
      db.rooms,
      { name: "Sala 1", cinemaId: cinema.id },
      {
        name: "Sala 1",
        capacity: 50,
        roomType: "2D",
        cinemaId: cinema.id
      }
    );

    const room2 = await upsertByWhere(
      db.rooms,
      { name: "Sala 2", cinemaId: cinema.id },
      {
        name: "Sala 2",
        capacity: 40,
        roomType: "3D",
        cinemaId: cinema.id
      }
    );

    async function seedSeats(room, rows, seatsPerRow, vipRow = null) {
      for (const rowLabel of rows) {
        for (let seatNumber = 1; seatNumber <= seatsPerRow; seatNumber++) {
          await upsertByWhere(
            db.seats,
            {
              roomId: room.id,
              rowLabel,
              seatNumber
            },
            {
              roomId: room.id,
              rowLabel,
              seatNumber,
              seatType: rowLabel === vipRow ? "vip" : "regular"
            }
          );
        }
      }
    }

    await seedSeats(room1, ["A", "B", "C", "D", "E"], 10, "E");
    await seedSeats(room2, ["A", "B", "C", "D"], 10, "D");

    console.log("[seed] Cine, salas y 90 asientos listos.");

    // ========================================================
    // GÉNEROS
    // ========================================================

    const genreNames = [
      "Acción",
      "Aventura",
      "Animación",
      "Ciencia ficción",
      "Comedia",
      "Drama",
      "Familia",
      "Fantasía",
      "Musical",
      "Romance",
      "Suspenso"
    ];

    const genreMap = new Map();

    for (const name of genreNames) {
      const [genre] = await db.genres.findOrCreate({ where: { name } });
      genreMap.set(name, genre);
    }

    // ========================================================
    // PELÍCULAS, ACTORES, REPARTO Y GÉNEROS
    // ========================================================

    const movieRows = [];

    for (const data of MOVIES) {
      const movie = await upsertByWhere(
        db.movies,
        { title: data.title },
        {
          title: data.title,
          synopsis: data.synopsis,
          durationMinutes: data.durationMinutes,
          releaseDate: data.releaseDate,
          rating: data.rating,
          posterUrl: data.posterUrl,
          backdropUrl: data.backdropUrl,
          originalLanguage: data.originalLanguage,
          status: true
        }
      );

      const genreIds = data.genres.map(name => genreMap.get(name).id);
      await movie.setGenres(genreIds);

      for (const [fullName, role] of data.cast) {
        const person = await upsertByWhere(
          db.persons,
          { fullName },
          {
            fullName,
            photoUrl: null,
            birthDate: null,
            biography: `Integrante del reparto de ${data.title}.`
          }
        );

        const [castRow, castCreated] = await db.movieCasts.findOrCreate({
          where: {
            movieId: movie.id,
            personId: person.id
          },
          defaults: {
            movieId: movie.id,
            personId: person.id,
            role
          }
        });

        if (!castCreated && castRow.role !== role) {
          await castRow.update({ role });
        }
      }

      movieRows.push(movie);
      console.log(`[seed] Película lista: ${movie.title}`);
    }

    // ========================================================
    // PROMOCIONES
    // ========================================================

    const promotions = [];

    promotions.push(
      await upsertByWhere(
        db.promotions,
        { name: "Martes de Cine" },
        {
          name: "Martes de Cine",
          description: "50% de descuento en funciones seleccionadas.",
          discountPercentage: 50,
          validFrom: futureDate(-1, 0),
          validTo: futureDate(120, 23, 59),
          status: true
        }
      )
    );

    promotions.push(
      await upsertByWhere(
        db.promotions,
        { name: "Matiné" },
        {
          name: "Matiné",
          description: "20% de descuento en funciones tempranas seleccionadas.",
          discountPercentage: 20,
          validFrom: futureDate(-1, 0),
          validTo: futureDate(120, 23, 59),
          status: true
        }
      )
    );

    promotions.push(
      await upsertByWhere(
        db.promotions,
        { name: "Estudiantes" },
        {
          name: "Estudiantes",
          description: "15% de descuento en funciones participantes.",
          discountPercentage: 15,
          validFrom: futureDate(-1, 0),
          validTo: futureDate(120, 23, 59),
          status: true
        }
      )
    );

    // ========================================================
    // FUNCIONES
    // Una función futura por película; si ya existe una función
    // semilla para esa película/sala/formato, se actualiza.
    // ========================================================

    const seededShows = [];

    for (let i = 0; i < movieRows.length; i++) {
      const movie = movieRows[i];
      const room = i % 2 === 0 ? room1 : room2;
      const format = i % 3 === 0 ? "subtitulada" : "doblada";
      const hour = i % 2 === 0 ? 18 : 20;
      const basePrice = room.id === room2.id ? 55 : 45;
      const showDatetime = futureDate(i + 1, hour, i % 2 === 0 ? 0 : 30);

      let show = await db.shows.findOne({
        where: {
          movieId: movie.id,
          roomId: room.id,
          format
        },
        order: [["id", "ASC"]]
      });

      if (show) {
        await show.update({
          showDatetime,
          basePrice,
          status: true
        });
      } else {
        show = await db.shows.create({
          movieId: movie.id,
          roomId: room.id,
          showDatetime,
          basePrice,
          format,
          status: true
        });
      }

      const promoIds = [];
      if (i % 3 === 0) promoIds.push(promotions[0].id);
      if (i % 3 === 1) promoIds.push(promotions[1].id);
      if (i % 3 === 2) promoIds.push(promotions[2].id);

      await show.setPromotions(promoIds);
      seededShows.push(show);
    }

    console.log(`[seed] ${seededShows.length} funciones futuras listas.`);

    // ========================================================
    // COMIDA Y CATEGORÍAS
    // ========================================================

    const categoryIds = {
      combos: await upsertFoodCategory(
        "Combos",
        "Paquetes de comida y bebida para disfrutar durante la función."
      ),
      bebidas: await upsertFoodCategory(
        "Bebidas",
        "Bebidas frías disponibles en dulcería."
      ),
      snacks: await upsertFoodCategory(
        "Snacks",
        "Palomitas, nachos y acompañamientos de cine."
      )
    };

    const foods = [
      {
        name: "Combo Pareja",
        description: "2 palomitas medianas + 2 bebidas grandes.",
        price: 75,
        stock: 40,
        categoryId: categoryIds.combos
      },
      {
        name: "Combo Individual",
        description: "1 palomita mediana + 1 bebida grande.",
        price: 45,
        stock: 50,
        categoryId: categoryIds.combos
      },
      {
        name: "Coca-Cola Grande",
        description: "Bebida Coca-Cola tamaño grande.",
        price: 20,
        stock: 100,
        categoryId: categoryIds.bebidas
      },
      {
        name: "Sprite Grande",
        description: "Bebida Sprite tamaño grande.",
        price: 20,
        stock: 80,
        categoryId: categoryIds.bebidas
      },
      {
        name: "Palomitas Grandes",
        description: "Palomitas de maíz tamaño grande.",
        price: 35,
        stock: 70,
        categoryId: categoryIds.snacks
      },
      {
        name: "Nachos con queso",
        description: "Nachos crujientes acompañados con queso.",
        price: 30,
        stock: 60,
        categoryId: categoryIds.snacks
      }
    ];

    for (const foodData of foods) {
      await upsertByWhere(
        db.foods,
        { name: foodData.name },
        {
          ...foodData,
          imageUrl: null,
          status: true
        }
      );
    }

    console.log(`[seed] ${foods.length} productos de dulcería listos.`);

    // ========================================================
    // RESEÑAS DE PRUEBA
    // ========================================================

    const reviewData = [
      ["Dune: Part Two", 5, "Excelente fotografía, sonido y construcción del mundo."],
      ["Inside Out 2", 5, "Muy entretenida y con un buen mensaje para toda la familia."],
      ["Deadpool & Wolverine", 4, "Acción, humor y una química muy buena entre los protagonistas."],
      ["The Wild Robot", 5, "Una historia emotiva y visualmente muy bonita."],
      ["Wicked", 4, "Grandes actuaciones y números musicales muy bien logrados."],
      ["Moana 2", 4, "Aventura familiar entretenida y con buena música."],
      ["Superman", 4, "Una versión luminosa del personaje con buenas escenas de acción."],
      ["Jurassic World Rebirth", 4, "Buen espectáculo de aventura y dinosaurios."],
      ["How to Train Your Dragon", 5, "Una adaptación emocionante y muy disfrutable en pantalla grande."],
      ["Mission: Impossible - The Final Reckoning", 5, "Acción de gran escala y secuencias muy intensas."]
    ];

    for (const [title, rating, comment] of reviewData) {
      const movie = movieRows.find(m => m.title === title);

      const [review, created] = await db.reviews.findOrCreate({
        where: {
          userId: cliente.id,
          movieId: movie.id
        },
        defaults: {
          userId: cliente.id,
          movieId: movie.id,
          rating,
          comment,
          reviewDate: new Date()
        }
      });

      if (!created) {
        await review.update({
          rating,
          comment,
          reviewDate: new Date()
        });
      }
    }

    // ========================================================
    // RESUMEN
    // ========================================================

    console.log("\n============================================");
    console.log(" SEED COMPLETADO");
    console.log("============================================");
    console.log(`Películas:       ${MOVIES.length}`);
    console.log(`Funciones:       ${seededShows.length}`);
    console.log(`Cine:            ${cinema.name}`);
    console.log("Salas:           2");
    console.log("Asientos:        90");
    console.log(`Comidas:         ${foods.length}`);
    console.log(`Promociones:     ${promotions.length}`);
    console.log(`Reseñas:         ${reviewData.length}`);
    console.log("--------------------------------------------");
    console.log("Admin seed:");
    console.log("  email:    admin.seed@nebajpolis.local");
    console.log("  password: Admin123*");
    console.log("Cliente seed:");
    console.log("  email:    cliente.seed@nebajpolis.local");
    console.log("  password: Cliente123*");
    console.log("--------------------------------------------");
    console.log("Las ventas, tickets, pagos y órdenes de comida");
    console.log("se crean mediante el flujo real de compra/Stripe.");
    console.log("============================================\n");
  } catch (error) {
    console.error("\n[seed] ERROR:", error);
    process.exitCode = 1;
  } finally {
    await db.sequelize.close();
  }
}

seed();
