import type {
  ControllerFrame,
  CreateAckFrame,
  DeleteAckFrame,
  EventFrame,
  ErrorFrame,
  HandshakeAckFrame,
  HeartbeatAckFrame,
  SyncAckFrame,
  UpdateAckFrame,
} from "./frames";

export function isSyncAckFrame(frame: ControllerFrame): frame is SyncAckFrame {
  return frame.type === "sync:ack";
}

export function isEventFrame(frame: ControllerFrame): frame is EventFrame {
  return frame.type === "event";
}

export function isHeartbeatAckFrame(frame: ControllerFrame): frame is HeartbeatAckFrame {
  return frame.type === "heartbeat:ack";
}

export function isCreateAckFrame(frame: ControllerFrame): frame is CreateAckFrame {
  return frame.type === "create:ack";
}

export function isUpdateAckFrame(frame: ControllerFrame): frame is UpdateAckFrame {
  return frame.type === "update:ack";
}

export function isDeleteAckFrame(frame: ControllerFrame): frame is DeleteAckFrame {
  return frame.type === "delete:ack";
}

export function isHandshakeAckFrame(frame: ControllerFrame): frame is HandshakeAckFrame {
  return frame.type === "handshake:ack";
}

export function isErrorFrame(frame: ControllerFrame): frame is ErrorFrame {
  return frame.type === "error";
}
