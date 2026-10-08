#!/bin/bash
#
# ngdpbase Docker Setup Helper Script
# Automates the setup process for Docker deployment
#
# Usage: Run from project root or docker directory
#   From root: ./docker/docker-setup.sh
#   From docker: cd docker && ./docker-setup.sh
#

set -e  # Exit on error

# Detect if we're in docker directory or project root
if [ -f "docker-setup.sh" ]; then
    # We're in the docker directory, move to parent
    cd ..
fi

echo "🚀 ngdpbase Docker Setup"
echo "======================="
echo ""
echo "📍 Working directory: $(pwd)"
echo ""

# 1. Validate Docker installation first
echo "🔍 Checking Docker installation..."
if ! command -v docker &> /dev/null; then
    echo "   ❌ Docker is not installed"
    echo "   Please install Docker: https://docs.docker.com/get-docker/"
    exit 1
fi

if ! docker info >/dev/null 2>&1; then
    echo "   ❌ Docker daemon is not running"
    echo "   Please start Docker and try again"
    exit 1
fi

if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null 2>&1; then
    echo "   ⚠️  Docker Compose is not installed"
    echo "   Please install Docker Compose: https://docs.docker.com/compose/install/"
    exit 1
fi

echo "   ✅ Docker is installed and running"
echo ""

# 2. Create required directories with proper permissions
echo "📁 Creating required directories..."
mkdir -p pages data logs sessions search-index work required-pages
chmod 755 pages data logs sessions search-index work required-pages
echo "   ✅ Created: pages, data, logs, sessions, search-index, work, required-pages"
echo ""

# 3. Create .env file with current user's PUID/PGID (#1693)
if [ -f docker/.env ]; then
    echo "⚠️  docker/.env file already exists"
    read -p "   Do you want to overwrite it? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "   Keeping existing .env file"
        echo ""
    else
        rm docker/.env
        echo "   Removed existing .env file"
        echo ""
    fi
fi

if [ ! -f docker/.env ]; then
    echo "⚙️  Creating docker/.env file with your user permissions..."
    cp docker/.env.example docker/.env

    # Get current user's UID and GID
    CURRENT_UID=$(id -u)
    CURRENT_GID=$(id -g)
    
    # Auto-detect platform-specific defaults if needed
    if [ "$CURRENT_UID" -eq 0 ]; then
        # #1693: ngdpbase never runs as root, so PUID/PGID 0 would refuse to start.
        echo "   ⚠️  Running as root (UID 0): using the standard run-as user 1000:1000 instead"
        CURRENT_UID=1000
        CURRENT_GID=1000
    fi

    # Check for available port starting from 3000
    echo "🔍 Checking port availability..."
    AVAILABLE_PORT=3000
    for port in {3000..3010}; do
        if ! lsof -Pi :$port -sTCP:LISTEN -t >/dev/null 2>&1 && \
           ! netstat -tuln 2>/dev/null | grep -q ":$port "; then
            AVAILABLE_PORT=$port
            echo "   ✅ Port $AVAILABLE_PORT is available"
            break
        else
            echo "   ⚠️  Port $port is already in use"
        fi
    done

    # Update docker/.env file with current user's UID/GID and available port
    # Note: Using different approach for cross-platform compatibility
    if [[ "$OSTYPE" == "darwin"* ]]; then
        # macOS
        sed -i '' "s/^PUID=.*/PUID=$CURRENT_UID/" docker/.env
        sed -i '' "s/^PGID=.*/PGID=$CURRENT_GID/" docker/.env
        sed -i '' "s/^HOST_PORT=.*/HOST_PORT=$AVAILABLE_PORT/" docker/.env
    else
        # Linux
        sed -i "s/^PUID=.*/PUID=$CURRENT_UID/" docker/.env
        sed -i "s/^PGID=.*/PGID=$CURRENT_GID/" docker/.env
        sed -i "s/^HOST_PORT=.*/HOST_PORT=$AVAILABLE_PORT/" docker/.env
    fi

    echo "   ✅ Created docker/.env with PUID=$CURRENT_UID, PGID=$CURRENT_GID, PORT=$AVAILABLE_PORT"
    echo ""
fi

# 4. Note about configuration
echo "📋 Configuration"
echo "   Configuration is handled automatically by the installation wizard on first run."
echo "   After setup, customize settings in data/config/app-custom-config.json"
echo ""

# 5. Summary and next steps
echo "✅ Setup complete!"
echo ""
echo "📝 Configuration summary:"
echo "   - Directories: pages, data, logs, sessions, search-index, work, required-pages"
echo "   - Run-as user: PUID=$(grep '^PUID=' docker/.env | cut -d= -f2), PGID=$(grep '^PGID=' docker/.env | cut -d= -f2)"
echo "   - Host port: $(grep '^HOST_PORT=' docker/.env | cut -d= -f2)"
echo "   - Node environment: $(grep '^NODE_ENV=' docker/.env | cut -d= -f2)"
echo "   - Docker status: ✅ Installed and running"
echo ""
echo "🚀 Next steps:"
echo "   1. (Optional) Edit docker/.env to change port or other settings"
echo "   2. Build image: cd docker && bash build-image.sh"
echo "   3. Start ngdpbase: cd docker && docker-compose up -d"
echo "   4. Complete installation wizard at http://localhost:$(grep '^HOST_PORT=' docker/.env | cut -d= -f2)"
echo "   5. (Optional) Customize data/config/app-custom-config.json after setup"
echo "   6. View logs: cd docker && docker-compose logs -f"
echo ""
echo "📚 For more information, see docker/DOCKER.md"
