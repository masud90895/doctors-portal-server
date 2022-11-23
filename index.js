// doctors-portal
// 0iG3hZqFrbcETDhe

const { MongoClient, ObjectId, ServerApiVersion } = require("mongodb");
const express = require("express");
const cors = require("cors");
const app = express();
//gitignor
require("dotenv").config();
const jwt = require("jsonwebtoken");
const port = process.env.PORT || 5000;

// payment
const stripe = require("stripe")('sk_test_51M6vRsAQbSi5oGhujrnKAIjU9eJ4biffkR5ogLBGkTpWkQSyKDZQ8mgLLaAY4Ts1Gew5PiZG8fWh0MEe68rhjTEs001I9ExZBb');

// used Middleware
app.use(cors());
// backend to client data sent
app.use(express.json());

// Connact With MongoDb Database
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@cluster0.2vi6qur.mongodb.net/?retryWrites=true&w=majority`;
const client = new MongoClient(uri, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  serverApi: ServerApiVersion.v1,
});

function verifyJWT(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return res.status(401).send({ message: "unauthorized access" });
  }
  const token = authHeader.split(" ")[1];

  jwt.verify(token, process.env.TOKEN, function (err, decoded) {
    if (err) {
      return res.status(403).send({ message: "Forbidden access" });
    }
    req.decoded = decoded;
    next();
  });
}

// Create a async function to all others activity
async function run() {
  try {
    // Create Database to store Data
    const DoctorsPortal = client
      .db("doctorsPortal")
      .collection("appoinmentOption");
    const Bookings = client.db("doctorsPortal").collection("bookings");
    const Users = client.db("doctorsPortal").collection("users");
    const Doctors = client.db("doctorsPortal").collection("doctors");
    const Payments = client.db("doctorsPortal").collection("payments");

    app.get("/appinmentOption", async (req, res) => {
      const date = req.query.date;
      const data = await DoctorsPortal.find({}).toArray();
      const bookingsQuery = { appointmentDate: date };
      const alreadyBooked = await Bookings.find(bookingsQuery).toArray();
      //be careful
      data.forEach((option) => {
        const optionBooked = alreadyBooked.filter(
          (book) => book.name === option.name
        );
        const bookedSlot = optionBooked.map((book) => book.slot);
        const remainingSlots = option.slots.filter(
          (slot) => !bookedSlot.includes(slot)
        );
        option.slots = remainingSlots;
      });
      res.send(data);
    });
    app.get("/appinmentEpecialty", async (req, res) => {

      const data = await DoctorsPortal.find({}).project({name : 1}).toArray();
      res.send(data);
    });
    app.get("/dashboard/payment/:id", async (req, res) => {
      const id= req.params.id
      const query = {_id : ObjectId(id)}
      const data = await Bookings.findOne(query)
      res.send(data);
    });

    app.get("/bookings", verifyJWT, async (req, res) => {
      const query = req.query.email;
      const result = await Bookings.find({ email: query }).toArray();
      res.send(result);
    });

    app.post("/bookings", async (req, res) => {
      const booking = req.body;

      console.log(booking);
      const query = {
        appointmentDate: booking.appointmentDate,
        email: booking.email,
        name: booking.name,
      };
      const alreadybooked = await Bookings.find(query).toArray();

      if (alreadybooked.length) {
        const message = `You already have a booking on ${booking.appointmentDate} in ${booking.name}`;
        return res.send({ acknowledged: false, message });
      }

      const result = await Bookings.insertOne(booking);
      res.send(result);
    });

    app.get("/jwt", async (req, res) => {
      const email = req.query.email;
      const query = { email: email };
      const user = Users.findOne(query);
      if (user) {
        const token = jwt.sign({ email }, process.env.TOKEN, {
          expiresIn: "7d",
        });
        return res.send({ accessToken: token });
      }
      res.status(403).send({ accessToken: "" });
    });

    app.get("/allusers", async (req, res) => {
      const AllUser = await Users.find({}).toArray();
      res.send(AllUser);
    });
    // admin  access
    app.put("/allusers/admin/:id", verifyJWT, async (req, res) => {
      const decodedEmail = req.decoded.email;
      const query = { email: decodedEmail };
      const user = await Users.findOne(query);
      console.log(user);
      if (user?.role !== "admin") {
        return res.status(403).send({ message: "forbidden access" });
      }

      const id = req.params.id;
      const filter = { _id: ObjectId(id) };
      const option = { upsert: true };
      const updatedDoc = {
        $set: {
          role: "admin",
        },
      };

      const result = await Users.updateOne(filter, updatedDoc, option);
      res.send(result);
    });

    app.get("/allusers/admin/:email", verifyJWT, async (req, res) => {
      const email = req.params.email;
      const query = { email };
      const user = await Users.findOne(query);
      res.send({ isAdmin: user?.role === "admin" });
    });

    // admin end

    app.get('/doctors',async (req,res)=>{
      const result = await Doctors.find({}).toArray()
      res.send(result)
    })
    app.post('/doctors',async (req,res)=>{
      const data= req.body;
      const result = await Doctors.insertOne(data)
      res.send(result)
    })
    app.delete('/doctors/:id',async (req,res)=>{
      const id = req.params.id;
      const result = await Doctors.deleteOne({_id : ObjectId(id)})
      if(result.deletedCount){

        res.send(result)
      }
    })

    app.post("/users", async (req, res) => {
      const user = req.body;
      const userData = await Users.insertOne(user);
      res.send(userData);
    });

    //payment

    app.post('/create-payment-intent', async (req,res)=>{
      const booking = req.body
      const price = booking.price
      const amount = price * 100;
      console.log(amount);
      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: "usd",
        "payment_method_types" : [
          "card"
        ]
      });
      res.send({
        clientSecret: paymentIntent.client_secret,
      });
    })


    app.post('/payments',async (req,res)=>{
      const payment = req.body
      const result = await Payments.insertOne(payment)
      const id = payment.bookingId
      const filter = {_id : ObjectId(id)}
      const updatedDoc ={
        $set:{
          paid :true,
          transaction_id : payment.transaction_id
        }
      }

      const updateResult = await Bookings.updateOne(filter, updatedDoc)
      res.send(result)
    })

    //payment end




    
  } finally {
    // await client.close();
  }
}

// Call the fuction you decleare abobe
run().catch(console.dir);

// Root Api to cheack activity
app.get("/", (req, res) => {
  res.send("Hello From server!");
});

app.listen(port, () => console.log(`Server up and running ${port}`));
