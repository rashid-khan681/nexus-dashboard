const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const os = require('os'); // Imported native OS module for real metrics
require('dotenv').config();

const setupDatabase = require('./database.js');
const { generateInfrastructureInsight } = require('./ai_controller.js');

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

let dbInstance = null;

// Helper function to calculate exact CPU load percentage across all cores
function getCpuUsage(previousCpu) {
    const cpus = os.cpus();
    let user = 0, nice = 0, sys = 0, idle = 0, irq = 0;
    
    for (let cpu of cpus) {
        user += cpu.times.user;
        nice += cpu.times.nice;
        sys += cpu.times.sys;
        irq += cpu.times.irq;
        idle += cpu.times.idle;
    }
    const total = user + nice + sys + idle + irq;
    const currentCpu = { idle, total };

    if (!previousCpu) return { usage: 0, raw: currentCpu };

    const idleDiff = currentCpu.idle - previousCpu.idle;
    const totalDiff = currentCpu.total - previousCpu.total;
    const usage = 100 - Math.floor((100 * idleDiff) / totalDiff);

    return { usage, raw: currentCpu };
}

io.on('connection', (socket) => {
    console.log(`[+] New Client Connected: ${socket.id}`);

    socket.on('ping_request', () => socket.emit('pong_response'));
    let tickCount = 0;
    let previousCpu = null;

    const metricInterval = setInterval(async () => {
        // 1. Calculate Real CPU Load
        const cpuData = getCpuUsage(previousCpu);
        previousCpu = cpuData.raw;
        let realCpu = cpuData.usage;

        // 2. Calculate Real RAM Usage
        const totalMem = os.totalmem();
        const freeMem = os.freemem();
        const usedMem = totalMem - freeMem;
        const realRam = Math.floor((usedMem / totalMem) * 100);

        // 3. Get Real Active Connections
        const realConnections = io.engine.clientsCount;

        // Active-Passive DR Architecture Data Array
        const hardwareDataArray = [
            {
                region: 'ap-south-1', // Primary Node (Active)
                cpuUsage: realCpu,
                ramUsage: realRam,
                activeConnections: realConnections,
                status: realCpu > 85 ? 'Warning: High CPU' : 'Healthy'
            },
            {
                region: 'ap-south-2', // Secondary Node (Passive/Standby)
                cpuUsage: Math.floor(realCpu * 0.1), // Standby consumes minimal compute
                ramUsage: realRam, // Running on same physical host right now
                activeConnections: 0, // No active traffic routed here unless failover happens
                status: 'Standby'
            }
        ];

        const primaryRegion = hardwareDataArray[0];

        // Emit REAL telemetry to frontend
        socket.emit('infrastructure_metrics', hardwareDataArray);
        tickCount++;

        // Trigger AI Analysis every 10 seconds (5 ticks)
        if (tickCount % 5 === 0 && dbInstance) {
            console.log(`\n🧠 Analyzing Real Hardware - CPU: ${primaryRegion.cpuUsage}%, RAM: ${primaryRegion.ramUsage}%`);
            const aiResult = await generateInfrastructureInsight(primaryRegion);
            
            try {
                const result = await dbInstance.run(
                    `INSERT INTO server_logs (region, cpu_usage, ram_usage, status) VALUES (?, ?, ?, ?)`,
                    [primaryRegion.region, primaryRegion.cpuUsage, primaryRegion.ramUsage, primaryRegion.status]
                );
                await dbInstance.run(
                    `INSERT INTO ai_insights (log_id, insight_text, confidence_score) VALUES (?, ?, ?)`,
                    [result.lastID, aiResult.insight_text, aiResult.confidence_score]
                );
                
              // 🚨 POSTGRESQL 10-DAYS ROLLING WINDOW RETENTION POLICY
                await dbInstance.run(`DELETE FROM server_logs WHERE created_at < NOW() - INTERVAL '10 days'`);
                await dbInstance.run(`DELETE FROM ai_insights WHERE created_at < NOW() - INTERVAL '10 days'`);
                
                socket.emit('ai_alert', aiResult);
            } catch (err) {
                console.error("Database Insert Error:", err.message);
            }
        }
    }, 2000);

    socket.on('disconnect', () => {
        console.log(`[-] Client Disconnected: ${socket.id}`);
        clearInterval(metricInterval);
    });
});

const PORT = process.env.PORT || 5001;

setupDatabase().then((db) => {
    dbInstance = db;
    app.locals.db = db;
    
    server.listen(PORT, () => {
        console.log(`🚀 Nexus 2.0 Backend running on port ${PORT}`);
        console.log(`📡 Hardware Telemetry Server active...`);
    });
}).catch(err => console.error("Database connection failed:", err));