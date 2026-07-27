require('dotenv').config();
const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');

const connectDB = require('./config/db');
const registerSocketHandlers = require('./sockets/socketHandler');

const authRoutes = require('./routes/authRoutes');
const tripRoutes = require('./routes/tripRoutes');
const locationRoutes = require('./routes/locationRoutes');
const expenseRoutes = require('./routes/expenseRoutes');
const sosRoutes = require('./routes/sosRoutes');

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: '*' }
});

app.set('io', io);

app.use(cors());
app.use(express.json());

// Health check
app.get('/', (req, res) => {
  res.status(200).json({ status: 'ok', service: 'RideSync API' });
});

// REST API routes
app.use('/api', authRoutes);
app.use('/api/trip', tripRoutes);
app.use('/api/location', locationRoutes);
app.use('/api/expense', expenseRoutes);
app.use('/api/sos', sosRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ message: 'Route not found' });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ message: 'Internal server error' });
});

registerSocketHandlers(io);

const PORT = process.env.PORT || 5000;

const start = async () => {
  await connectDB();
  server.listen(PORT, () => {
    console.log(`RideSync backend running on port ${PORT}`);
  });
};

start();
