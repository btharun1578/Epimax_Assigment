const express = require("express");
const path = require("path");
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const app = express();
app.use(express.json());
const dbPath = path.join(__dirname, "covid19IndiaPortal.db");

let db = null;

const initializeDBAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    app.listen(3000, () => {
      console.log("Server Running at http://localhost:3000/");
    });
  } catch (e) {
    console.log(`DB Error: ${e.message}`);
    process.exit(1);
  }
};
initializeDBAndServer();

///Check Users
app.get("/users/", async (request, response) => {
  const query1 = `select * from user`;
  const usersDetails = await db.all(query1);
  response.send(usersDetails);
});

///API register the user
app.post("/register", async (request, response) => {
  const { username, name, password, gender, location } = request.body;
  const hashedPassword = await bcrypt.hash(password, 10);

  const checkUser = `select * from user where username='${username}';`;
  const dbResponse = await db.get(checkUser);
  console.log(dbResponse);
  if (dbResponse === undefined) {
    if (password.length < 5) {
      response.status(400);
      response.send("Password is too short");
    } else {
      const registerUser = `insert into user(username,name,password,gender,location)
            values ('${username}','${name}','${hashedPassword}','${gender}','${location}');`;
      const newUser = await db.run(registerUser);
      const lastId = newUser.lastID;
      response.send("User created successfully");
    }
  } else {
    response.status(400);
    response.send("User already exists");
  }
});

//login user with generation of token
app.post("/login", async (request, response) => {
  const { username, password } = request.body;
  const gettingUser = `select * from user where username='${username}';`;
  const userDetails = await db.get(gettingUser);
  if (userDetails === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    const isPasswordMatched = await bcrypt.compare(
      password,
      userDetails.password
    );
    if (isPasswordMatched === true) {
      const payload = {
        username: username,
      };
      const jwtToken = jwt.sign(payload, "MY_SECRET_TOKEN");
      response.send({ jwtToken: jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  }
});

///malware function for validating the jwt authentication
const authenticationToken = (request, response, next) => {
  let jwtToken;
  const authHeader = request.headers["authorization"];
  //console.log(authHeader);
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }
  if (jwtToken === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "MY_SECRET_TOKEN", async (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        next();
      }
    });
  }
};
/// get list of all states

app.get("/states/", authenticationToken, async (request, response) => {
  const query2 = `select * from state`;
  const getStates = await db.all(query2);
  response.send(
    getStates.map((eachItem) => {
      return {
        stateId: eachItem.state_id,
        stateName: eachItem.state_name,
        population: eachItem.population,
      };
    })
  );
});

///get details of specific state
app.get("/states/:stateId/", authenticationToken, async (request, response) => {
  const { stateId } = request.params;
  const query3 = `select * from state where state_id="${stateId}";`;
  const stateDetails = await db.get(query3);
  response.send({
    stateId: stateDetails.state_id,
    stateName: stateDetails.state_name,
    population: stateDetails.population,
  });
});

//API3 creating a district
app.post("/districts/", authenticationToken, async (request, response) => {
  const { districtName, stateId, cases, cured, active, deaths } = request.body;
  const query3 = `insert into district (district_name,state_id,cases,cured,active,deaths)
    values('${districtName}',${stateId},${cases},${cured},${active},${deaths});`;
  await db.run(query3);
  response.send("District Successfully Added");
});

///API4 getting the required list
const getDistrictDetails = (dbData) => {
  return {
    districtId: dbData.district_id,
    districtName: dbData.district_name,
    stateId: dbData.state_id,
    cases: dbData.cases,
    cured: dbData.cured,
    active: dbData.active,
    deaths: dbData.deaths,
  };
};

app.get(
  "/districts/:districtId/",
  authenticationToken,
  async (request, response) => {
    const { districtId } = request.params;
    const query4 = `select * from district where district_id=${districtId};`;
    const districtDetails = await db.get(query4);
    response.send(getDistrictDetails(districtDetails));
  }
);

///API delete district

app.delete(
  "/districts/:districtId/",
  authenticationToken,
  async (request, response) => {
    const { districtId } = request.params;
    const query5 = `delete from district where district_id=${districtId};`;
    await db.run(query5);
    response.send("District Removed");
  }
);

//API6 update the district
app.put(
  "/districts/:districtId/",
  authenticationToken,
  async (request, response) => {
    const { districtId } = request.params;
    const {
      districtName,
      stateId,
      cases,
      cured,
      active,
      deaths,
    } = request.body;
    const query6 = `update district set district_name='${districtName}',state_id=${stateId},cases=${cases},
    cured=${cured},active=${active},deaths=${deaths};`;
    await db.run(query6);
    response.send("District Details Updated");
  }
);

///API7 return mixed or total updates
const totalDetailsOfState = (dbData) => {
  return {
    totalCases: dbData.tcases,
    totalCured: dbData.tcured,
    totalActive: dbData.tactive,
    totalDeaths: dbData.tdeaths,
  };
};

app.get(
  "/states/:stateId/stats/",
  authenticationToken,
  async (request, response) => {
    const { stateId } = request.params;
    const query7 = `select sum(cases) as tcases,sum(cured) as tcured,sum(active) as tactive,sum(deaths) as tdeaths from district where state_id=${stateId};`;
    const detailsOfState = await db.get(query7);
    console.log(detailsOfState);

    response.send(totalDetailsOfState(detailsOfState));
  }
);
module.exports = app;
