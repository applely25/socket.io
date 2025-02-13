import { useEffect, useState } from "react";
import styled from "@emotion/styled";
import { socket } from "../main";
import { useNavigate } from "react-router-dom";
import { v4 as uuidv4 } from "uuid";

interface Room {
  id: string;
  name: string;
  clients: string[];
  participants: string[];
  maxParticipants: number;
}

interface RoomList {
  myRooms: Room[];
  availableRooms: Room[];
  fullRooms: Room[];
}

interface NicknameModalProps {
  onSubmit: (nickname: string) => void;
}

const NicknameModal = ({ onSubmit }: NicknameModalProps) => {
  const [inputNickname, setInputNickname] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputNickname.trim()) {
      onSubmit(inputNickname.trim());
    }
  };

  return (
    <ModalOverlay>
      <ModalContent>
        <form onSubmit={handleSubmit}>
          <h2>닉네임을 입력해주세요</h2>
          <ModalInput
            type="text"
            value={inputNickname}
            onChange={(e) => setInputNickname(e.target.value)}
            placeholder="닉네임"
            autoFocus
          />
          <ModalButton type="submit" disabled={!inputNickname.trim()}>
            확인
          </ModalButton>
        </form>
      </ModalContent>
    </ModalOverlay>
  );
};

const Home = () => {
  const [myRooms, setMyRooms] = useState<Room[]>([]);
  const [availableRooms, setAvailableRooms] = useState<Room[]>([]);
  const [fullRooms, setFullRooms] = useState<Room[]>([]);
  const [showModal, setShowModal] = useState(!localStorage.getItem("nickname"));
  const [nickname, setNickname] = useState(
    () => localStorage.getItem("nickname") || ""
  );
  const [userId] = useState(() => {
    const savedUserId = localStorage.getItem("userId");
    if (savedUserId) return savedUserId;
    const newUserId = uuidv4();
    localStorage.setItem("userId", newUserId);
    return newUserId;
  });
  const nav = useNavigate();
  const [roomName, setRoomName] = useState("");
  const [maxParticipants, setMaxParticipants] = useState(2);
  const [showCreateRoomModal, setShowCreateRoomModal] = useState(false);

  useEffect(() => {
    if (nickname) {
      socket.emit("set-nickname", nickname, userId);
    }

    socket.on("nickname-required", () => {
      setShowModal(true);
    });

    socket.on("room-list", (roomList: RoomList) => {
      setMyRooms(roomList.myRooms);
      setAvailableRooms(roomList.availableRooms);
      setFullRooms(roomList.fullRooms);
    });

    socket.on("update-room-list", () => {
      socket.emit("update-room-list");
    });

    socket.on("room-created", (roomId: string) => {
      nav(`/room/${roomId}`);
    });

    socket.on("room-joined", (roomId: string) => {
      nav(`/room/${roomId}`);
    });

    socket.on("room-full", () => {
      alert("방이 가득 찼습니다.");
    });

    socket.on("room-not-found", () => {
      alert("방을 찾을 수 없습니다.");
    });

    return () => {
      socket.off("nickname-required");
      socket.off("room-list");
      socket.off("update-room-list");
      socket.off("room-created");
      socket.off("room-joined");
      socket.off("room-full");
      socket.off("room-not-found");
    };
  }, [nickname, userId]);

  const handleNicknameSubmit = (newNickname: string) => {
    setNickname(newNickname);
    localStorage.setItem("nickname", newNickname);
    socket.emit("set-nickname", newNickname, userId);
    setShowModal(false);
  };

  const handleCreateRoom = () => {
    if (!nickname) {
      setShowModal(true);
      return;
    }
    setShowCreateRoomModal(true);
  };

  const handleCreateRoomSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (roomName.trim()) {
      socket.emit("create-room", maxParticipants, roomName);
      setShowCreateRoomModal(false);
      setRoomName("");
      setMaxParticipants(2);
    }
  };

  const handleJoinRoom = (roomId: string) => {
    if (!nickname) {
      setShowModal(true);
      return;
    }
    socket.emit("join-room", roomId);
  };

  return (
    <Container>
      {showModal && <NicknameModal onSubmit={handleNicknameSubmit} />}
      {showCreateRoomModal && (
        <ModalOverlay>
          <ModalContent>
            <form onSubmit={handleCreateRoomSubmit}>
              <h2>채팅방 생성</h2>
              <ModalInput
                type="text"
                value={roomName}
                onChange={(e) => setRoomName(e.target.value)}
                placeholder="채팅방 이름"
                autoFocus
              />
              <ParticipantSelect
                value={maxParticipants}
                onChange={(e) => setMaxParticipants(Number(e.target.value))}
              >
                {[...Array(9)].map((_, i) => (
                  <option key={i + 2} value={i + 2}>
                    {i + 2}명
                  </option>
                ))}
              </ParticipantSelect>
              <ModalButton type="submit" disabled={!roomName.trim()}>
                생성하기
              </ModalButton>
            </form>
          </ModalContent>
        </ModalOverlay>
      )}
      <Title>채팅방 목록</Title>

      <CreateButton onClick={handleCreateRoom}>채팅방 생성하기</CreateButton>

      <SectionTitle>참여 중인 방</SectionTitle>
      <RoomGrid>
        {myRooms.map((room) => (
          <RoomCard key={room.id} onClick={() => handleJoinRoom(room.id)}>
            <RoomInfo>
              <div>{room.name}</div>
              <ParticipantInfo>
                <span>
                  👥 {room.participants.length}/{room.maxParticipants}명
                </span>
                {room.clients.length > 0 && (
                  <span>• 🟢 {room.clients.length}명 접속 중</span>
                )}
              </ParticipantInfo>
            </RoomInfo>
            <JoinStatus>참여중</JoinStatus>
          </RoomCard>
        ))}
        {myRooms.length === 0 && (
          <EmptyMessage>참여 중인 방이 없습니다.</EmptyMessage>
        )}
      </RoomGrid>

      <SectionTitle>참여 가능한 방</SectionTitle>
      <RoomGrid>
        {availableRooms.map((room) => (
          <RoomCard key={room.id} onClick={() => handleJoinRoom(room.id)}>
            <RoomInfo>
              <div>{room.name}</div>
              <ParticipantInfo>
                <span>
                  👥 {room.participants.length}/{room.maxParticipants}명
                </span>
                {room.clients.length > 0 && (
                  <span>• 🟢 {room.clients.length}명 접속 중</span>
                )}
              </ParticipantInfo>
            </RoomInfo>
            <JoinStatus>참여하기</JoinStatus>
          </RoomCard>
        ))}
        {availableRooms.length === 0 && (
          <EmptyMessage>참여 가능한 방이 없습니다.</EmptyMessage>
        )}
      </RoomGrid>

      <SectionTitle>참여 불가능한 방</SectionTitle>
      <RoomGrid>
        {fullRooms.map((room) => (
          <RoomCard
            key={room.id}
            style={{ opacity: 0.5, cursor: "not-allowed" }}
          >
            <RoomInfo>
              <div>{room.name}</div>
              <ParticipantInfo>
                <span>
                  👥 {room.participants.length}/{room.maxParticipants}명
                </span>
                {room.clients.length > 0 && (
                  <span>• 🟢 {room.clients.length}명 접속 중</span>
                )}
              </ParticipantInfo>
            </RoomInfo>
            <JoinStatus style={{ color: "red" }}>정원 초과</JoinStatus>
          </RoomCard>
        ))}
        {fullRooms.length === 0 && (
          <EmptyMessage>정원이 초과된 방이 없습니다.</EmptyMessage>
        )}
      </RoomGrid>
    </Container>
  );
};

const Container = styled.div`
  padding: 1rem;
  max-width: 1200px;
  margin: 0 auto;
  background: #f8fafc;
  min-height: 100vh;

  @media (min-width: 640px) {
    padding: 2rem;
  }
`;

const Title = styled.h1`
  font-size: 1.5rem;
  font-weight: bold;
  margin-bottom: 1.5rem;
  color: #1a1a1a;
  text-align: center;

  @media (min-width: 640px) {
    font-size: 1.8rem;
    text-align: left;
  }
`;

const CreateButton = styled.button`
  width: 100%;
  background-color: #3b82f6;
  color: white;
  padding: 0.875rem 1.5rem;
  border-radius: 8px;
  margin-bottom: 1.5rem;
  cursor: pointer;
  transition: all 0.2s;
  font-size: 1rem;
  font-weight: 500;
  border: none;
  box-shadow: 0 2px 4px rgba(59, 130, 246, 0.2);

  @media (min-width: 640px) {
    width: auto;
  }

  &:hover {
    background-color: #2563eb;
    transform: translateY(-1px);
    box-shadow: 0 4px 6px rgba(59, 130, 246, 0.3);
  }

  &:active {
    transform: translateY(0);
  }
`;

const RoomGrid = styled.div`
  display: grid;
  gap: 1rem;
  grid-template-columns: 1fr;

  @media (min-width: 640px) {
    grid-template-columns: repeat(2, 1fr);
  }

  @media (min-width: 1024px) {
    grid-template-columns: repeat(3, 1fr);
  }
`;

const RoomCard = styled.div`
  background: white;
  border-radius: 12px;
  padding: 1rem;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
  transition: all 0.2s ease-in-out;
  border: 1px solid #eee;

  &:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.12);
  }

  &:active {
    transform: translateY(0);
  }
`;

const RoomInfo = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.5rem;

  > div:first-of-type {
    font-weight: 600;
    font-size: 1.1rem;
    color: #1a1a1a;
  }

  > div:last-of-type {
    font-size: 0.9rem;
    color: #666;
  }
`;

const SectionTitle = styled.h2`
  font-size: 1.2rem;
  font-weight: 600;
  margin: 2rem 0 1rem;
  color: #1a1a1a;
  padding-bottom: 0.5rem;
  border-bottom: 2px solid #f0f0f0;
`;

const EmptyMessage = styled.div`
  text-align: center;
  color: #666;
  padding: 2rem;
  background: #f9f9f9;
  border-radius: 12px;
  font-size: 0.95rem;
`;

const JoinStatus = styled.div`
  margin-top: 1rem;
  padding-top: 0.75rem;
  border-top: 1px solid #eee;
  text-align: right;
  font-size: 0.9rem;
  font-weight: 500;
  color: #3b82f6;
`;

const ParticipantInfo = styled.div`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  color: #666;
  font-size: 0.9rem;

  > span {
    display: flex;
    align-items: center;
    gap: 0.25rem;
  }
`;

const ModalOverlay = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
`;

const ModalContent = styled.div`
  background-color: white;
  padding: 2rem;
  border-radius: 1rem;
  width: 90%;
  max-width: 400px;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);

  h2 {
    margin: 0 0 1.5rem 0;
    text-align: center;
  }

  form {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }
`;

const ModalInput = styled.input`
  padding: 0.75rem;
  border-radius: 0.5rem;
  border: 1px solid #ddd;
  font-size: 1rem;
  width: 100%;
  box-sizing: border-box;

  &:focus {
    outline: none;
    border-color: #007aff;
  }
`;

const ModalButton = styled.button`
  padding: 0.75rem;
  border-radius: 0.5rem;
  border: none;
  background-color: #007aff;
  color: white;
  font-weight: bold;
  cursor: pointer;
  width: 100%;
  font-size: 1rem;
  transition: background-color 0.2s;

  &:disabled {
    background-color: #cccccc;
    cursor: not-allowed;
  }

  &:hover:not(:disabled) {
    background-color: #0056b3;
  }
`;

const ParticipantSelect = styled.select`
  padding: 0.75rem;
  border-radius: 0.5rem;
  border: 1px solid #ddd;
  font-size: 1rem;
  width: 100%;
  box-sizing: border-box;
  margin-bottom: 0.5rem;

  &:focus {
    outline: none;
    border-color: #007aff;
  }
`;

export default Home;
