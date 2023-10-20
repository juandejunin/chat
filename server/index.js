// Importación de módulos y configuración inicial

import express from 'express';  // Importar Express.js para el servidor web
import logger from 'morgan';     // Importar el middleware para el registro de solicitudes HTTP
import dotenv from 'dotenv';     // Importar dotenv para la configuración de variables de entorno
import { createClient } from '@libsql/client';  // Importar el cliente de base de datos
import { Server } from 'socket.io';   // Importar Socket.IO para manejar conexiones en tiempo real
import { createServer } from 'node:http';  // Importar el módulo http de Node.js

dotenv.config();  // Cargar variables de entorno desde un archivo .env (si existe)

const port = process.env.PORT || 3000;  // Configurar el puerto del servidor

const app = express();  // Inicializar la aplicación Express
const server = createServer(app);  // Crear un servidor HTTP basado en la aplicación Express
const io = new Server(server, {
  connectionStateRecovery: {},
});

// Función para inicializar la base de datos y las tablas
const initializeDatabase = async () => {
  const db = createClient({
    url: 'libsql://exotic-hercules-juandejunin.turso.io',  // URL de la base de datos
    authToken: process.env.DB_TOKEN,  // Token de autenticación obtenido de las variables de entorno
  });

  // Crear una tabla si no existe en la base de datos
  await db.execute(`
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      content TEXT,
      user TEXT
    )
  `);

  return db;  // Devolver la instancia del cliente de la base de datos
};

// Función para manejar mensajes del chat
const handleChatMessage = async (socket, msg) => {
  const username = socket.handshake.auth.username || 'anonymous';  // Obtener el nombre de usuario del cliente

  try {
    const db = await initializeDatabase();  // Inicializar la base de datos
    const result = await db.execute({
      sql: 'INSERT INTO messages (content, user) VALUES (:msg, :username)',  // Consulta SQL para insertar mensajes
      args: { msg, username },  // Argumentos de la consulta
    });

    io.emit('chat message', msg, result.lastInsertRowid.toString(), username);  // Enviar el mensaje a todos los clientes conectados
  } catch (e) {
    console.error(e);
  }
};

// Función para recuperar mensajes sin conexión
const recoverMessages = async (socket) => {
  if (!socket.recovered) {
    try {
      const db = await initializeDatabase();  // Inicializar la base de datos
      const results = await db.execute({
        sql: 'SELECT id, content, user FROM messages WHERE id > ?',  // Consulta SQL para recuperar mensajes
        args: [socket.handshake.auth.serverOffset || 0],  // Argumentos de la consulta
      });

      results.rows.forEach((row) => {
        socket.emit('chat message', row.content, row.id.toString(), row.user);  // Enviar mensajes recuperados al cliente
      });
    } catch (e) {
      console.error(e);
    }
  }
};

// Manejo de conexiones en tiempo real con Socket.IO

io.on('connection', (socket) => {
  console.log('A user has connected!');  // Registrar la conexión de un usuario

  socket.on('disconnect', () => {
    console.log('A user has disconnected');  // Registrar la desconexión de un usuario
  });

  socket.on('chat message', (msg) => {
    handleChatMessage(socket, msg);  // Manejar un mensaje de chat enviado por un usuario
  });

  recoverMessages(socket);  // Recuperar mensajes sin conexión para el usuario

});

// Configuración de middleware y rutas

app.use(logger('dev'));  // Configurar el middleware de registro de solicitudes HTTP

app.get('/', (req, res) => {
  res.sendFile(process.cwd() + '/client/index.html');  // Ruta para servir un archivo HTML
});

// Iniciar el servidor en el puerto especificado

server.listen(port, () => {
  console.log(`Server running on port ${port}`);  // Registrar la ejecución del servidor en el puerto
});
