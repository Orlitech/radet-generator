#!/bin/bash

echo "📦 Installing RADET Report Generator v3.0..."

# Install dependencies
npm install

# Create logs directory
mkdir -p logs

# Check if config exists
if [ ! -f config.json ]; then
    echo "📝 Creating default configuration..."
    cp config.template.json config.json
fi

# Check if query exists
if [ ! -f query.sql ]; then
    echo "📝 Creating template query..."
    cp query.template.sql query.sql
fi

echo "✅ Installation complete!"
echo "🚀 Run 'npm start' to start the server"