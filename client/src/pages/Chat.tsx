import { useState, useEffect, useRef } from "react";
import { useParams } from "react-router-dom";
import { socket } from "../main";
import styled from "@emotion/styled";

interface Message {
  message: string;
  id: string;
  nickname: string;
  timestamp: string;
}

interface FormattedMessage {
  message: string;
  isMine: boolean;
  nickname: string;
  timestamp: string;
}

interface Participant {
  nickname: string;
  isOnline: boolean;
}

interface RoomInfo {
  name: string;
  maxParticipants: number;
  currentParticipants: number;
  participants: Participant[];
}

interface TypingUser {
  nickname: string;
  timestamp: number;
}

const Chat = () => {
  const { roomId } = useParams<{ roomId: string }>();
  const [message, setMessage] = useState<string>("");
  const [messages, setMessages] = useState<FormattedMessage[]>(() => {
    const cached = localStorage.getItem(`chat-${roomId}`);
    return cached ? JSON.parse(cached) : [];
  });
  const [userId] = useState(() => localStorage.getItem("userId") || "");
  const [nickname] = useState(() => localStorage.getItem("nickname") || "");
  const messageContainerRef = useRef<HTMLDivElement>(null);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [newMessagePreview, setNewMessagePreview] =
    useState<FormattedMessage | null>(null);
  const [isScrolledToBottom, setIsScrolledToBottom] = useState(true);
  const [roomInfo, setRoomInfo] = useState<RoomInfo | null>(null);
  const [typingUsers, setTypingUsers] = useState<TypingUser[]>([]);
  const typingTimeoutRef = useRef<NodeJS.Timeout | undefined>(undefined);

  useEffect(() => {
    if (!roomId) return;

    socket.emit("room-exists", roomId);

    const handleRoomExists = (data: {
      messages: Message[];
      roomInfo: RoomInfo;
    }) => {
      const formattedMessages = data.messages.map((msg) => ({
        message: msg.message,
        isMine: msg.id === userId,
        nickname: msg.nickname,
        timestamp: msg.timestamp,
      }));
      setMessages(formattedMessages);
      setRoomInfo(data.roomInfo);
      localStorage.setItem(`chat-${roomId}`, JSON.stringify(formattedMessages));
    };

    const handleRoomInfoUpdated = (updatedRoomInfo: RoomInfo) => {
      setRoomInfo(updatedRoomInfo);
    };

    const handleReceiveMessage = (msg: Message) => {
      setMessages((prevMessages) => {
        const newMessage = {
          message: msg.message,
          isMine: msg.id === userId,
          nickname: msg.nickname,
          timestamp: msg.timestamp,
        };

        if (!showScrollButton && !newMessage.isMine) {
          setNewMessagePreview(newMessage);
        }

        const newMessages = [...prevMessages, newMessage];
        localStorage.setItem(`chat-${roomId}`, JSON.stringify(newMessages));
        return newMessages;
      });
    };

    socket.on("room-exists", handleRoomExists);
    socket.on("room-info-updated", handleRoomInfoUpdated);
    socket.on("receive-message", handleReceiveMessage);

    socket.on(
      "user-typing",
      ({
        nickname: typingNickname,
        userId: typingUserId,
      }: {
        nickname: string;
        userId: string;
      }) => {
        if (typingUserId !== userId) {
          setTypingUsers((prev) => {
            const filtered = prev.filter(
              (user) => user.nickname !== typingNickname
            );
            return [
              ...filtered,
              { nickname: typingNickname, timestamp: Date.now() },
            ];
          });
        }
      }
    );
    socket.on(
      "user-stop-typing",
      ({ nickname: stoppedNickname }: { nickname: string }) => {
        setTypingUsers((prev) =>
          prev.filter((user) => user.nickname !== stoppedNickname)
        );
      }
    );

    return () => {
      socket.off("room-exists", handleRoomExists);
      socket.off("room-info-updated", handleRoomInfoUpdated);
      socket.off("receive-message", handleReceiveMessage);
      socket.off("user-typing");
      socket.off("user-stop-typing");
      if (roomId) {
        socket.emit("leave-room", roomId);
      }
    };
  }, [roomId, userId]);

  useEffect(() => {
    if (!messageContainerRef.current) return;

    if (isScrolledToBottom) {
      messageContainerRef.current.scrollTop =
        messageContainerRef.current.scrollHeight;
    }
  }, [messages, isScrolledToBottom]);

  useEffect(() => {
    const interval = setInterval(() => {
      setTypingUsers((prev) =>
        prev.filter((user) => Date.now() - user.timestamp < 3000)
      );
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!messageContainerRef.current) return;

    if (isScrolledToBottom && typingUsers.length > 0) {
      messageContainerRef.current.scrollTop =
        messageContainerRef.current.scrollHeight;
    }
  }, [typingUsers, isScrolledToBottom]);

  const handleSendMessage = () => {
    if (!message.trim() || !roomId || !nickname) return;

    socket.emit("send-message", roomId, message);
    setMessage("");

    setIsScrolledToBottom(true);
    if (messageContainerRef.current) {
      messageContainerRef.current.scrollTop =
        messageContainerRef.current.scrollHeight;
    }
    setNewMessagePreview(null);
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      handleSendMessage();
    }
  };

  const handleScroll = () => {
    if (!messageContainerRef.current) return;

    const { scrollTop, scrollHeight, clientHeight } =
      messageContainerRef.current;
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 100;
    setIsScrolledToBottom(isAtBottom);
    setShowScrollButton(!isAtBottom);

    if (isAtBottom) {
      setNewMessagePreview(null);
    }
  };

  const scrollToBottom = () => {
    if (messageContainerRef.current) {
      messageContainerRef.current.scrollTop =
        messageContainerRef.current.scrollHeight;
      setNewMessagePreview(null);
    }
  };
  
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setMessage(e.target.value);
  
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    socket.emit("typing", { roomId, nickname });

    typingTimeoutRef.current = setTimeout(() => {
      socket.emit("stop-typing", { roomId, nickname });
    }, 3000);
  };

  return (
    <Container>
      <Header>
        {roomInfo && (
          <RoomInfoContainer>
            <RoomTitle>{roomInfo.name}</RoomTitle>
            <ParticipantInfo>
              참여자 {roomInfo.currentParticipants}/{roomInfo.maxParticipants}
              <ParticipantList>
                {roomInfo.participants.map((participant, index) => (
                  <ParticipantName key={index} isOnline={participant.isOnline}>
                    {participant.nickname}
                  </ParticipantName>
                ))}
              </ParticipantList>
            </ParticipantInfo>
          </RoomInfoContainer>
        )}
        <NicknameDisplay>닉네임: {nickname}</NicknameDisplay>
      </Header>
      <MessageContainer ref={messageContainerRef} onScroll={handleScroll}>
        {messages.map((msg, index) => (
          <MessageWrapper key={index} isMine={msg.isMine}>
            <Sender>{msg.isMine ? "나" : msg.nickname}</Sender>
            <Message isMine={msg.isMine}>
              {msg.message}
              <TimeStamp isMine={msg.isMine}>
                {new Date(msg.timestamp).toLocaleTimeString()}
              </TimeStamp>
            </Message>
          </MessageWrapper>
        ))}
        {typingUsers.length > 0 && (
          <TypingIndicator>
            {typingUsers.map((user) => user.nickname).join(", ")}
            님이 입력하고 있습니다...
          </TypingIndicator>
        )}
      </MessageContainer>
      {showScrollButton && (
        <ScrollButton onClick={scrollToBottom}>↓</ScrollButton>
      )}
      {newMessagePreview && (
        <MessagePreview onClick={scrollToBottom}>
          <PreviewContent>
            <PreviewSender>{newMessagePreview.nickname}</PreviewSender>
            <PreviewText>{newMessagePreview.message}</PreviewText>
          </PreviewContent>
        </MessagePreview>
      )}
      <InputContainer>
        <Input
          type="text"
          value={message}
          onChange={handleInputChange}
          onKeyPress={handleKeyPress}
          placeholder="메시지를 입력하세요..."
        />
        <SendButton onClick={handleSendMessage}>전송</SendButton>
      </InputContainer>
    </Container>
  );
};

const Container = styled.div`
  display: flex;
  flex-direction: column;
  height: 100vh;
  max-height: 100vh;
  overflow: hidden;
  background: #f8fafc;
`;

const Header = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem;
  background-color: white;
  border-bottom: 1px solid #eee;
  flex-shrink: 0;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);

  @media (min-width: 640px) {
    padding: 1.5rem 2rem;
  }
`;

const MessageContainer = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 1rem;
  overflow-y: auto;
  padding: 1rem;
  background-color: #f8fafc;
  max-width: 1200px;
  width: 100vw;
  box-sizing: border-box;
  margin: 0 auto;

  @media (min-width: 640px) {
    padding: 2rem;
  }

  &::-webkit-scrollbar {
    width: 6px;
  }

  &::-webkit-scrollbar-thumb {
    background-color: #cbd5e1;
    border-radius: 3px;
  }

  &::-webkit-scrollbar-track {
    background-color: #f1f5f9;
  }
`;

const MessageWrapper = styled.div<{ isMine: boolean }>`
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  align-items: ${(props) => (props.isMine ? "flex-end" : "flex-start")};
  margin: 0.5rem 0;
`;

const Sender = styled.span`
  font-size: 0.8rem;
  color: #666;
  margin: 0 0.5rem;
`;

const Message = styled.div<{ isMine: boolean }>`
  padding: 0.75rem 1rem;
  border-radius: 1rem;
  background-color: ${(props) => (props.isMine ? "#3b82f6" : "white")};
  color: ${(props) => (props.isMine ? "#ffffff" : "#1a1a1a")};
  word-break: break-word;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
  border: 1px solid ${(props) => (props.isMine ? "transparent" : "#e5e7eb")};
  position: relative;
  transition: transform 0.2s;

  &:hover {
    transform: translateY(-1px);
  }
`;

const TimeStamp = styled.span<{ isMine: boolean }>`
  font-size: 0.7rem;
  color: ${(props) =>
    props.isMine ? "rgba(255, 255, 255, 0.7)" : "rgba(0, 0, 0, 0.5)"};
  margin-left: 0.5rem;
`;

const InputContainer = styled.div`
  display: flex;
  gap: 0.75rem;
  padding: 1rem;
  background-color: white;
  border-top: 1px solid #eee;
  flex-shrink: 0;
  max-width: 1200px;
  margin: 0 auto;
  width: 100%;
  box-sizing: border-box;

  @media (min-width: 640px) {
    padding: 1.5rem 2rem;
    gap: 1rem;
  }
`;

const Input = styled.input`
  flex: 1;
  padding: 0.75rem 1.25rem;
  border-radius: 12px;
  border: 1px solid #e5e7eb;
  font-size: 0.95rem;
  background-color: #f8fafc;
  transition: all 0.2s;

  &:focus {
    outline: none;
    border-color: #3b82f6;
    background-color: white;
    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
  }
`;

const SendButton = styled.button`
  padding: 0.75rem 1.5rem;
  border-radius: 12px;
  border: none;
  background-color: #3b82f6;
  color: white;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
  box-shadow: 0 2px 4px rgba(59, 130, 246, 0.2);

  &:hover {
    background-color: #2563eb;
    transform: translateY(-1px);
    box-shadow: 0 4px 6px rgba(59, 130, 246, 0.3);
  }

  &:active {
    transform: translateY(0);
  }
`;

const NicknameDisplay = styled.div`
  font-size: 0.9rem;
  color: #666;
`;

const ScrollButton = styled.button`
  position: fixed;
  bottom: 90px;
  right: 20px;
  width: 40px;
  height: 40px;
  border-radius: 12px;
  background-color: #3b82f6;
  color: white;
  border: none;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.25rem;
  box-shadow: 0 2px 8px rgba(59, 130, 246, 0.3);
  transition: all 0.2s;
  z-index: 1000;

  &:hover {
    background-color: #2563eb;
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(59, 130, 246, 0.4);
  }

  &:active {
    transform: translateY(0);
  }
`;

const MessagePreview = styled.div`
  position: fixed;
  bottom: 90px;
  left: 50%;
  transform: translateX(-50%);
  background-color: #3b82f6;
  color: white;
  padding: 1rem 1.5rem;
  border-radius: 12px;
  box-shadow: 0 4px 12px rgba(59, 130, 246, 0.3);
  cursor: pointer;
  z-index: 1000;
  max-width: 90%;
  animation: slideUp 0.3s ease-out;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;

  @media (min-width: 640px) {
    max-width: 400px;
  }

  &:hover {
    background-color: #2563eb;
    transform: translate(-50%, -2px);
  }

  @keyframes slideUp {
    from {
      transform: translate(-50%, 100%);
      opacity: 0;
    }
    to {
      transform: translate(-50%, 0);
      opacity: 1;
    }
  }
`;

const PreviewContent = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
`;

const PreviewSender = styled.span`
  font-size: 0.8rem;
  opacity: 0.9;
  color: #e5e7eb;
`;

const PreviewText = styled.span`
  font-size: 0.9rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 300px;
  color: white;
`;

const RoomInfoContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
`;

const RoomTitle = styled.h1`
  margin: 0;
  font-size: 1.25rem;
  color: #1a1a1a;
  font-weight: 600;

  @media (min-width: 640px) {
    font-size: 1.5rem;
  }
`;

const ParticipantInfo = styled.div`
  font-size: 0.9rem;
  color: #666;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
`;

const ParticipantList = styled.div`
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
  align-items: center;

  &::before {
    content: "•";
    color: #cbd5e1;
  }
`;

const ParticipantName = styled.span<{ isOnline: boolean }>`
  color: ${(props) => (props.isOnline ? "#3b82f6" : "#94a3b8")};
  font-size: 0.85rem;

  &:not(:last-child)::after {
    content: ",";
    color: #cbd5e1;
    margin-left: 2px;
  }
`;

const TypingIndicator = styled.div`
  font-size: 0.9rem;
  color: #666;
  padding: 0.5rem 1rem;
  font-style: italic;
`;

export default Chat;
