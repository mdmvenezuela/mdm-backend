-- =========================
-- FUNCIONES
-- =========================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;


-- =========================
-- TABLA: super_admins
-- =========================
CREATE TABLE IF NOT EXISTS super_admins (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);


-- =========================
-- TABLA: resellers
-- =========================
CREATE TABLE IF NOT EXISTS resellers (
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


-- =========================
-- TABLA: licenses
-- =========================
CREATE TABLE IF NOT EXISTS licenses (
    id SERIAL PRIMARY KEY,
    license_key VARCHAR(100) UNIQUE NOT NULL,
    reseller_id INT REFERENCES resellers(id) ON DELETE CASCADE,
    status VARCHAR(20) DEFAULT 'DISPONIBLE',
    device_imei VARCHAR(50),
    assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    activated_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);


-- =========================
-- TABLA: devices
-- =========================
CREATE TABLE IF NOT EXISTS devices (
    id SERIAL PRIMARY KEY,
    imei VARCHAR(50) UNIQUE NOT NULL,
    reseller_id INT REFERENCES resellers(id) ON DELETE CASCADE,
    license_id INT REFERENCES licenses(id),
    client_name VARCHAR(100),
    client_phone VARCHAR(20),
    status VARCHAR(20) DEFAULT 'ACTIVO',
    last_location_lat DECIMAL(10, 8),
    last_location_lon DECIMAL(11, 8),
    last_connection TIMESTAMP,
    battery_level INT,
    is_online BOOLEAN DEFAULT false,
    enrolled_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);


-- =========================
-- TABLA: location_history
-- =========================
CREATE TABLE IF NOT EXISTS location_history (
    id SERIAL PRIMARY KEY,
    device_id INT REFERENCES devices(id) ON DELETE CASCADE,
    latitude DECIMAL(10, 8) NOT NULL,
    longitude DECIMAL(11, 8) NOT NULL,
    battery_level INT,
    network_type VARCHAR(20),
    recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);


-- =========================
-- TABLA: pending_commands
-- =========================
CREATE TABLE IF NOT EXISTS pending_commands (
    id SERIAL PRIMARY KEY,
    device_id INT REFERENCES devices(id) ON DELETE CASCADE,
    command_type VARCHAR(50) NOT NULL,
    command_data JSONB,
    status VARCHAR(20) DEFAULT 'PENDING',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    executed_at TIMESTAMP
);


-- =========================
-- TABLA: enrollment_tokens
-- =========================
CREATE TABLE IF NOT EXISTS enrollment_tokens (
    id SERIAL PRIMARY KEY,
    token VARCHAR(100) UNIQUE NOT NULL,
    reseller_id INT REFERENCES resellers(id) ON DELETE CASCADE,
    license_id INT REFERENCES licenses(id),
    is_used BOOLEAN DEFAULT false,
    expires_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);


-- =========================
-- ÍNDICES
-- =========================
CREATE INDEX IF NOT EXISTS idx_devices_reseller ON devices(reseller_id);
CREATE INDEX IF NOT EXISTS idx_devices_imei ON devices(imei);
CREATE INDEX IF NOT EXISTS idx_licenses_reseller ON licenses(reseller_id);
CREATE INDEX IF NOT EXISTS idx_licenses_status ON licenses(status);
CREATE INDEX IF NOT EXISTS idx_location_device ON location_history(device_id);
CREATE INDEX IF NOT EXISTS idx_commands_device ON pending_commands(device_id);
CREATE INDEX IF NOT EXISTS idx_commands_status ON pending_commands(status);


-- =========================
-- TRIGGERS (solo si no existen)
-- =========================
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger WHERE tgname = 'update_resellers_updated_at'
    ) THEN
        CREATE TRIGGER update_resellers_updated_at
        BEFORE UPDATE ON resellers
        FOR EACH ROW
        EXECUTE FUNCTION update_updated_at_column();
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger WHERE tgname = 'update_devices_updated_at'
    ) THEN
        CREATE TRIGGER update_devices_updated_at
        BEFORE UPDATE ON devices
        FOR EACH ROW
        EXECUTE FUNCTION update_updated_at_column();
    END IF;
END $$;
