CREATE DATABASE IF NOT EXISTS opencode_workspace CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE opencode_workspace;

CREATE TABLE IF NOT EXISTS users (
  id CHAR(36) PRIMARY KEY,
  username VARCHAR(64) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('admin','user') NOT NULL DEFAULT 'user',
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS web_sessions (
  token_hash CHAR(64) PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  expires_at DATETIME NOT NULL,
  INDEX idx_sessions_user (user_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS pairing_codes (
  code_hash CHAR(64) PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  expires_at DATETIME NOT NULL,
  consumed_at DATETIME NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS computers (
  id CHAR(36) PRIMARY KEY,
  owner_id CHAR(36) NOT NULL,
  name VARCHAR(100) NOT NULL,
  device_token_hash CHAR(64) NOT NULL UNIQUE,
  revoked BOOLEAN NOT NULL DEFAULT FALSE,
  last_seen DATETIME NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_pc_owner (owner_id),
  FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS chats (
  id CHAR(36) PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  computer_id CHAR(36) NOT NULL,
  title VARCHAR(160) NOT NULL,
  session_id VARCHAR(160) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_chats_user (user_id, updated_at),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (computer_id) REFERENCES computers(id) ON DELETE CASCADE
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS messages (
  id CHAR(36) PRIMARY KEY,
  seq BIGINT NOT NULL AUTO_INCREMENT UNIQUE,
  chat_id CHAR(36) NOT NULL,
  source_id VARCHAR(180) NOT NULL,
  role ENUM('user','assistant') NOT NULL,
  content MEDIUMTEXT NOT NULL,
  parts_json JSON NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_msg_source (chat_id, source_id),
  FOREIGN KEY (chat_id) REFERENCES chats(id) ON DELETE CASCADE
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS jobs (
  id CHAR(36) PRIMARY KEY,
  chat_id CHAR(36) NOT NULL,
  status ENUM('queued','running','completed','failed','interrupted') NOT NULL DEFAULT 'queued',
  error_text TEXT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (chat_id) REFERENCES chats(id) ON DELETE CASCADE
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS permission_requests (
  id CHAR(36) PRIMARY KEY,
  chat_id CHAR(36) NOT NULL,
  request_id VARCHAR(180) NOT NULL,
  details_json JSON NOT NULL,
  decision ENUM('pending','once','reject') NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_permission (chat_id, request_id),
  FOREIGN KEY (chat_id) REFERENCES chats(id) ON DELETE CASCADE
) ENGINE=InnoDB;
