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

// 초기 설정: 디렉토리와 파일 생성
if (!fs.existsSync(CHAT_DIR)) {
  fs.mkdirSync(CHAT_DIR);
}

// 채팅 내역 로드 함수
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

// 채팅 내역 저장 함수
function saveChatHistory(roomId, messages) {
  const filePath = path.join(CHAT_DIR, `${roomId}.json`);
  try {
    fs.writeFileSync(filePath, JSON.stringify(messages));
  } catch (error) {
    console.error(`Error saving chat history for room ${roomId}:`, error);
  }
}

// 유저 데이터 로드 함수
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

// 유저 데이터 저장 함수
function saveUsers() {
  try {
    fs.writeFileSync(USERS_FILE, JSON.stringify(users));
  } catch (error) {
    console.error("Error saving users:", error);
  }
}

// rooms 데이터 로드 함수
function loadRooms() {
  try {
    if (fs.existsSync(ROOMS_FILE)) {
      const data = fs.readFileSync(ROOMS_FILE, "utf8");
      const loadedRooms = JSON.parse(data);
      return loadedRooms.map((room) => ({
        ...room,
        clients: [], // 실시간 접속자
        participants: room.participants || [], // 채팅방 참여자
        messages: loadChatHistory(room.id),
      }));
    }
  } catch (error) {
    console.error("Error loading rooms:", error);
  }
  return [];
}

// rooms 데이터 저장 함수
function saveRooms() {
  try {
    // rooms 객체에서 필요한 정보만 저장
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

// 초기 rooms 데이터 로드
let rooms = loadRooms();
let roomsId = rooms.map((room) => room.id);

// 초기 유저 데이터 로드
let users = {}; // { userId: { socketId: string, nickname: string, lastSeen: string } }

io.on("connection", (socket) => {
  console.log("New client connected", socket.id);

  // room-list 이벤트 수정
  const updateRoomList = () => {
    const userId = Object.keys(users).find(
      (id) => users[id].socketId === socket.id
    );

    console.log("Updating room list for userId:", userId);
    console.log("Current rooms:", rooms);

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

      console.log("Sending room lists:", {
        myRooms,
        availableRooms,
        fullRooms,
      });
      socket.emit("room-list", { myRooms, availableRooms, fullRooms });
    }
  };

  // 초기 방 목록 전송
  updateRoomList();

  // update-room-list 이벤트 핸들러 추가
  socket.on("update-room-list", () => {
    console.log("Received update-room-list request"); // 디버깅
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

      // 방의 현재 상태 정보
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

      // 다른 참여자들에게도 업데이트된 정보 전송
      io.to(roomId).emit("room-info-updated", roomInfo);

      saveRooms();
      io.sockets.emit("update-room-list");
    }
  });

  socket.on("join-room", (roomId) => {
    console.log("Join room attempt:", roomId);
    const room = rooms.find((room) => room.id === roomId);
    const userId = Object.keys(users).find(
      (id) => users[id].socketId === socket.id
    );

    console.log("Found room:", room);
    console.log("Found userId:", userId);

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

      // 방의 현재 상태를 모든 참여자에게 알림
      const updatedRoomInfo = {
        name: room.name,
        maxParticipants: room.maxParticipants,
        currentParticipants: room.participants.length,
        participants: room.participants.map((id) => ({
          nickname: users[id]?.nickname || "Unknown",
          isOnline: room.clients.includes(users[id]?.socketId),
        })),
      };

      // 해당 방의 모든 참여자에게 업데이트된 정보 전송
      io.to(roomId).emit("room-info-updated", updatedRoomInfo);

      saveRooms();
      io.sockets.emit("update-room-list");
    } else {
      console.log("Room not found:", roomId);
      socket.emit("room-not-found");
    }
  });

  socket.on("leave-room", (roomId) => {
    const room = rooms.find((room) => room.id === roomId);
    const userId = Object.keys(users).find(
      (id) => users[id].socketId === socket.id
    );

    if (room && userId) {
      // clients 배열에서 제거
      room.clients = room.clients.filter((id) => id !== socket.id);
      socket.leave(roomId);

      // 방의 현재 상태를 모든 참여자에게 알림
      const updatedRoomInfo = {
        name: room.name,
        maxParticipants: room.maxParticipants,
        currentParticipants: room.participants.length,
        participants: room.participants.map((id) => ({
          nickname: users[id]?.nickname || "Unknown",
          isOnline: room.clients.includes(users[id]?.socketId),
        })),
      };

      // 해당 방의 모든 참여자에게 업데이트된 정보 전송
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
      // 기존 사용자의 경우 socket.id만 업데이트
      users[userId].socketId = socket.id;
      users[userId].nickname = nickname;
      users[userId].lastSeen = new Date().toISOString();
    }
    saveUsers();
    socket.emit("nickname-set", nickname);

    // 닉네임 설정 후 방 목록 업데이트
    updateRoomList();
  });

  // 닉네임 가져오기
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

      // 참여자 목록에 없다면 추가
      if (!room.participants.includes(userId)) {
        room.participants.push(userId);
      }
      // 클라이언트 목록에 없다면 추가
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

  // 연결 종료 시 처리 수정
  socket.on("disconnect", () => {
    console.log("Client disconnected", socket.id);
    const userId = Object.keys(users).find(
      (id) => users[id].socketId === socket.id
    );

    if (userId) {
      users[userId].lastSeen = new Date().toISOString();
      saveUsers();

      // 모든 방을 순회하면서 해당 사용자가 참여한 방들의 정보 업데이트
      rooms.forEach((room) => {
        if (room.clients.includes(socket.id)) {
          room.clients = room.clients.filter(
            (clientId) => clientId !== socket.id
          );

          // 해당 방의 모든 참여자에게 업데이트된 정보 전송
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
