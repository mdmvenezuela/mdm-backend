-- Crear base de datos
CREATE DATABASE mdm_system;

-- Tabla de Super Admins
CREATE TABLE super_admins (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabla de Resellers (Negocios)
CREATE TABLE resellers (
    id SERIAL PRIMARY KEY,
    business_name VARCHAR(100) NOT NULL,
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    phone VARCHAR(20),
    total_licenses INT DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabla de Licencias
CREATE TABLE licenses (
    id SERIAL PRIMARY KEY,
    license_key VARCHAR(100) UNIQUE NOT NULL,
    reseller_id INT REFERENCES resellers(id) ON DELETE CASCADE,
    status VARCHAR(20) DEFAULT 'DISPONIBLE', -- DISPONIBLE, EN_USO, VINCULADA
    device_imei VARCHAR(50), -- IMEI del dispositivo que la usó/usa
    assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    activated_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabla de Dispositivos
CREATE TABLE devices (
    id SERIAL PRIMARY KEY,
    imei VARCHAR(50) UNIQUE NOT NULL,
    reseller_id INT REFERENCES resellers(id) ON DELETE CASCADE,
    license_id INT REFERENCES licenses(id),
    client_name VARCHAR(100),
    client_phone VARCHAR(20),
    status VARCHAR(20) DEFAULT 'ACTIVO', -- ACTIVO, BLOQUEADO, LIBERADO
    last_location_lat DECIMAL(10, 8),
    last_location_lon DECIMAL(11, 8),
    last_connection TIMESTAMP,
    battery_level INT,
    is_online BOOLEAN DEFAULT false,
    enrolled_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabla de Historial de Ubicaciones
CREATE TABLE location_history (
    id SERIAL PRIMARY KEY,
    device_id INT REFERENCES devices(id) ON DELETE CASCADE,
    latitude DECIMAL(10, 8) NOT NULL,
    longitude DECIMAL(11, 8) NOT NULL,
    battery_level INT,
    network_type VARCHAR(20),
    recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabla de Comandos Pendientes (para el dispositivo)
CREATE TABLE pending_commands (
    id SERIAL PRIMARY KEY,
    device_id INT REFERENCES devices(id) ON DELETE CASCADE,
    command_type VARCHAR(50) NOT NULL, -- LOCK, UNLOCK, CHANGE_PIN, MESSAGE, WIPE
    command_data JSONB, -- {message: "...", pin: "1234", etc}
    status VARCHAR(20) DEFAULT 'PENDING', -- PENDING, SENT, EXECUTED, FAILED
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    executed_at TIMESTAMP
);

-- Tabla de Tokens de Enrolamiento (QR)
CREATE TABLE enrollment_tokens (
    id SERIAL PRIMARY KEY,
    token VARCHAR(100) UNIQUE NOT NULL,
    reseller_id INT REFERENCES resellers(id) ON DELETE CASCADE,
    license_id INT REFERENCES licenses(id),
    is_used BOOLEAN DEFAULT false,
    expires_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Índices para mejorar performance
CREATE INDEX idx_devices_reseller ON devices(reseller_id);
CREATE INDEX idx_devices_imei ON devices(imei);
CREATE INDEX idx_licenses_reseller ON licenses(reseller_id);
CREATE INDEX idx_licenses_status ON licenses(status);
CREATE INDEX idx_location_device ON location_history(device_id);
CREATE INDEX idx_commands_device ON pending_commands(device_id);
CREATE INDEX idx_commands_status ON pending_commands(status);

-- Función para actualizar updated_at automáticamente
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers para updated_at
CREATE TRIGGER update_resellers_updated_at BEFORE UPDATE ON resellers
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_devices_updated_at BEFORE UPDATE ON devices
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();