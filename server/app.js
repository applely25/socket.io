const express = require("express");
const socket = require("socket.io");
const { v4: uuidv4 } = require("uuid");
const fs = require("fs");
const path = require("path");

const app = express();

const port = process.env.PORT || 8080;

const server = app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});

const io = socket(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

const ROOMS_FILE = path.join(__dirname, "rooms.json");
const CHAT_DIR = path.join(__dirname, "chat_history");
const USERS_FILE = path.join(__dirname, "users.json");

if (!fs.existsSync(CHAT_DIR)) {
  fs.mkdirSync(CHAT_DIR);
}

function loadChatHistory(roomId) {
  const filePath = path.join(CHAT_DIR, `${roomId}.json`);
  try {
    if (fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath, "utf8");
      return JSON.parse(data);
    }
  } catch (error) {
    console.error(`Error loading chat history for room ${roomId}:`, error);
  }
  return [];
}

function saveChatHistory(roomId, messages) {
  const filePath = path.join(CHAT_DIR, `${roomId}.json`);
  try {
    fs.writeFileSync(filePath, JSON.stringify(messages));
  } catch (error) {
    console.error(`Error saving chat history for room ${roomId}:`, error);
  }
}

function loadUsers() {
  try {
    if (fs.existsSync(USERS_FILE)) {
      const data = fs.readFileSync(USERS_FILE, "utf8");
      return JSON.parse(data);
    }
  } catch (error) {
    console.error("Error loading users:", error);
  }
  return {};
}

function saveUsers() {
  try {
    fs.writeFileSync(USERS_FILE, JSON.stringify(users));
  } catch (error) {
    console.error("Error saving users:", error);
  }
}

function loadRooms() {
  try {
    if (fs.existsSync(ROOMS_FILE)) {
      const data = fs.readFileSync(ROOMS_FILE, "utf8");
      const loadedRooms = JSON.parse(data);
      return loadedRooms.map((room) => ({
        ...room,
        clients: [],
        participants: room.participants || [],
        messages: loadChatHistory(room.id),
      }));
    }
  } catch (error) {
    console.error("Error loading rooms:", error);
  }
  return [];
}

function saveRooms() {
  try {
    const roomsToSave = rooms.map((room) => ({
      id: room.id,
      name: room.name,
      participants: room.participants,
      maxParticipants: room.maxParticipants,
    }));
    fs.writeFileSync(ROOMS_FILE, JSON.stringify(roomsToSave));
  } catch (error) {
    console.error("Error saving rooms:", error);
  }
}

let rooms = loadRooms();
let roomsId = rooms.map((room) => room.id);

let users = {};
io.on("connection", (socket) => {
  const updateRoomList = () => {
    const userId = Object.keys(users).find(
      (id) => users[id].socketId === socket.id
    );

    if (userId) {
      const myRooms = rooms.filter((room) =>
        room.participants.includes(userId)
      );

      const availableRooms = rooms.filter(
        (room) =>
          !room.participants.includes(userId) &&
          room.participants.length < room.maxParticipants
      );

      const fullRooms = rooms.filter(
        (room) =>
          !room.participants.includes(userId) &&
          room.participants.length >= room.maxParticipants
      );

      socket.emit("room-list", { myRooms, availableRooms, fullRooms });
    }
  };

  updateRoomList();

  socket.on("update-room-list", () => {
    updateRoomList();
  });

  socket.on("create-room", (maxParticipants = 2, roomName) => {
    const roomId = uuidv4();
    const userId = Object.keys(users).find(
      (id) => users[id].socketId === socket.id
    );

    if (!userId) {
      socket.emit("nickname-required");
      return;
    }

    if (!roomName || roomName.trim() === "") {
      socket.emit("room-name-required");
      return;
    }

    roomsId.push(roomId);
    rooms.push({
      id: roomId,
      name: roomName.trim(),
      clients: [socket.id],
      participants: [userId],
      messages: [],
      maxParticipants,
    });
    saveRooms();
    socket.join(roomId);
    socket.emit("room-created", roomId);
    io.sockets.emit("update-room-list");
  });

  socket.on("room-exists", (roomId) => {
    const room = rooms.find((room) => room.id === roomId);
    const userId = Object.keys(users).find(
      (id) => users[id].socketId === socket.id
    );

    if (room && userId) {
      if (!room.participants.includes(userId)) {
        room.participants.push(userId);
      }
      if (!room.clients.includes(socket.id)) {
        room.clients.push(socket.id);
      }
      socket.join(roomId);

      const roomInfo = {
        name: room.name,
        maxParticipants: room.maxParticipants,
        currentParticipants: room.participants.length,
        participants: room.participants.map((id) => ({
          nickname: users[id]?.nickname || "Unknown",
          isOnline: room.clients.includes(users[id]?.socketId),
        })),
      };

      socket.emit("room-exists", {
        messages: room.messages,
        roomInfo: roomInfo,
      });

      io.to(roomId).emit("room-info-updated", roomInfo);

      saveRooms();
      io.sockets.emit("update-room-list");
    }
  });

  socket.on("join-room", (roomId) => {
    const room = rooms.find((room) => room.id === roomId);
    const userId = Object.keys(users).find(
      (id) => users[id].socketId === socket.id
    );

    if (room) {
      if (!room.participants.includes(userId)) {
        if (room.participants.length >= room.maxParticipants) {
          socket.emit("room-full");
          return;
        }
        room.participants.push(userId);
      }

      if (!room.clients.includes(socket.id)) {
        room.clients.push(socket.id);
      }

      socket.join(roomId);
      socket.emit("room-joined", roomId);

      const updatedRoomInfo = {
        name: room.name,
        maxParticipants: room.maxParticipants,
        currentParticipants: room.participants.length,
        participants: room.participants.map((id) => ({
          nickname: users[id]?.nickname || "Unknown",
          isOnline: room.clients.includes(users[id]?.socketId),
        })),
      };

      io.to(roomId).emit("room-info-updated", updatedRoomInfo);

      saveRooms();
      io.sockets.emit("update-room-list");
    } else {
      socket.emit("room-not-found");
    }
  });

  socket.on("leave-room", (roomId) => {
    const room = rooms.find((room) => room.id === roomId);
    const userId = Object.keys(users).find(
      (id) => users[id].socketId === socket.id
    );

    if (room && userId) {
      room.clients = room.clients.filter((id) => id !== socket.id);
      socket.leave(roomId);

      const updatedRoomInfo = {
        name: room.name,
        maxParticipants: room.maxParticipants,
        currentParticipants: room.participants.length,
        participants: room.participants.map((id) => ({
          nickname: users[id]?.nickname || "Unknown",
          isOnline: room.clients.includes(users[id]?.socketId),
        })),
      };

      io.to(roomId).emit("room-info-updated", updatedRoomInfo);

      saveRooms();
      io.sockets.emit("update-room-list");
    }
  });

  socket.on("set-nickname", (nickname, userId) => {
    if (!users[userId]) {
      users[userId] = {
        socketId: socket.id,
        nickname: nickname,
        lastSeen: new Date().toISOString(),
      };
    } else {
      users[userId].socketId = socket.id;
      users[userId].nickname = nickname;
      users[userId].lastSeen = new Date().toISOString();
    }
    saveUsers();
    socket.emit("nickname-set", nickname);

    updateRoomList();
  });

  socket.on("get-nickname", () => {
    const user = users[socket.id];
    if (user) {
      socket.emit("nickname-get", user.nickname);
    }
  });

  socket.on("send-message", (roomId, message) => {
    const room = rooms.find((room) => room.id === roomId);
    if (room) {
      const userId = Object.keys(users).find(
        (id) => users[id].socketId === socket.id
      );

      if (!userId || !users[userId]) {
        socket.emit("nickname-required");
        return;
      }

      const nickname = users[userId].nickname;
      const messageData = {
        message,
        id: userId,
        nickname,
        timestamp: new Date().toISOString(),
      };

      if (!room.participants.includes(userId)) {
        room.participants.push(userId);
      }
      if (!room.clients.includes(socket.id)) {
        room.clients.push(socket.id);
      }

      room.messages.push(messageData);
      saveChatHistory(roomId, room.messages);
      saveRooms();
      io.to(roomId).emit("receive-message", messageData);
    } else {
      socket.emit("room-not-found");
    }
  });

  socket.on("typing", ({ roomId, nickname }) => {
    const userId = Object.keys(users).find(
      (id) => users[id].socketId === socket.id
    );
    socket.to(roomId).emit("user-typing", { nickname, userId });
  });

  socket.on("stop-typing", ({ roomId, nickname }) => {
    socket.to(roomId).emit("user-stop-typing", { nickname });
  });

  socket.on("disconnect", () => {
    const userId = Object.keys(users).find(
      (id) => users[id].socketId === socket.id
    );

    if (userId) {
      users[userId].lastSeen = new Date().toISOString();
      saveUsers();

      rooms.forEach((room) => {
        if (room.clients.includes(socket.id)) {
          room.clients = room.clients.filter(
            (clientId) => clientId !== socket.id
          );

          const updatedRoomInfo = {
            name: room.name,
            maxParticipants: room.maxParticipants,
            currentParticipants: room.participants.length,
            participants: room.participants.map((id) => ({
              nickname: users[id]?.nickname || "Unknown",
              isOnline: room.clients.includes(users[id]?.socketId),
            })),
          };

          io.to(room.id).emit("room-info-updated", updatedRoomInfo);
        }
      });

      saveRooms();
      io.sockets.emit("update-room-list");
    }
  });
});
