const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const {
    MongoClient,
    ServerApiVersion,
    Collection,
    ObjectId,
} = require('mongodb');
require('dotenv').config();

const port = process.env.PORT || 5000;

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@car-service-cluster.gmypetq.mongodb.net/?retryWrites=true&w=majority`;
// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    },
});

const verifyJWT = async (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!req.headers.authorization) {
        return res.status(401).send('Unauthorized Access');
    }

    const token = authHeader.split(' ')[1];

    jwt.verify(token, process.env.ACCESS_TOKEN, function (err, decoded) {
        if (err) {
            return res.status(403).send({ message: 'forbidden access' });
        }
        req.decoded = decoded;
        next();
    });
};

const run = async () => {
    try {
        // Collections
        const appointmentOptionCollection = client
            .db('doctorsPortal')
            .collection('appointmentOptions');
        const bookingsCollection = client
            .db('doctorsPortal')
            .collection('bookings');
        const usersCollection = client.db('doctorsPortal').collection('users');

        // Appointment API
        app.get('/appointmentOptions', async (req, res) => {
            const date = req.query.date;
            const query = {};
            const options = await appointmentOptionCollection
                .find(query)
                .toArray();
            const bookingQuery = { appointmentDate: date };
            const alreadyBooked = await bookingsCollection
                .find(bookingQuery)
                .toArray();
            options.map((option) => {
                const optionBooked = alreadyBooked.filter(
                    (book) => book.treatment === option.name
                );
                const bookedSlots = optionBooked.map((book) => book.slot);
                const remainingSlots = option.slots.filter(
                    (slot) => !bookedSlots.includes(slot)
                );
                option.slots = remainingSlots;
            });
            res.send(options);
        });

        // Booking API
        app.get('/bookings', verifyJWT, async (req, res) => {
            const email = req.query.email;
            const decodedEmail = req.decoded.email;
            if (email !== decodedEmail) {
                return res.status(403).send({ message: 'forbidden access' });
            }
            const query = {
                email: email,
            };
            const bookings = await bookingsCollection.find(query).toArray();
            res.send(bookings);
        });

        app.post('/bookings', async (req, res) => {
            const booking = req.body;
            const query = {
                email: booking.email,
                appointmentDate: booking.appointmentDate,
                treatment: booking.treatment,
            };
            const alreadyBooked = await bookingsCollection
                .find(query)
                .toArray();
            if (!booking.email) {
                const message = 'Please Login First To Book An Appointment';
                return res.send({ acknowledged: false, message });
            } else if (alreadyBooked.length) {
                const message = `You Already Have A Booking On ${booking.appointmentDate}`;
                return res.send({ acknowledged: false, message });
            }

            const result = await bookingsCollection.insertOne(booking);
            res.send(result);
        });

        // JWT Token
        app.get('/jwt', async (req, res) => {
            const email = req.query.email;
            const query = { email: email };
            const user = await usersCollection.findOne(query);
            if (user) {
                const token = jwt.sign({ email }, process.env.ACCESS_TOKEN, {
                    expiresIn: '1h',
                });
                return res.send({ accessToken: token });
            }
            res.status(403).send({ accessToken: '' });
        });

        // Users API
        app.get('/users', async (req, res) => {
            const query = {};
            const users = await usersCollection.find(query).toArray();
            res.send(users);
        });

        app.post('/users', async (req, res) => {
            const user = req.body;
            const result = await usersCollection.insertOne(user);
            res.send(result);
        });

        app.put('/users/admin/:id', verifyJWT, async (req, res) => {
            const decodedEmail = req.decoded.email;
            const query = { email: decodedEmail };
            const user = await usersCollection.findOne(query);
            if (user?.role !== 'admin') {
                return res.status(403).send({ message: 'forbidden access' });
            }
            const id = req.params.id;
            const filter = { _id: new ObjectId(id) };
            const options = { upsert: true };
            const updatedDoc = {
                $set: {
                    role: 'admin',
                },
            };
            const result = await usersCollection.updateOne(
                filter,
                updatedDoc,
                options
            );
            res.send(result);
        });
    } finally {
    }
};
run().catch(console.dir);

app.get('/', async (req, res) => {
    res.send('doctors portal server is running');
});

app.listen(port, () => console.log(`Doctors portal running on ${port}`));
