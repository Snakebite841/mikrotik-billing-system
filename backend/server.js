require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs').promises;
const MikrotikService = require('./mikrotikService');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

const ROUTERS_FILE = path.join(__dirname, 'routers.json');
let mikrotik = null;
let activeRouterId = null;

async function getRouters() {
    try {
        const data = await fs.readFile(ROUTERS_FILE, 'utf8');
        return JSON.parse(data);
    } catch {
        return [];
    }
}

async function saveRouters(routers) {
    await fs.writeFile(ROUTERS_FILE, JSON.stringify(routers, null, 2));
}

(async () => {
    let routers = await getRouters();
    if (routers.length === 0 && process.env.MIKROTIK_HOST) {
        routers.push({
            id: Date.now().toString(),
            name: 'Default from ENV',
            host: process.env.MIKROTIK_HOST,
            user: process.env.MIKROTIK_USER,
            password: process.env.MIKROTIK_PASSWORD
        });
        await saveRouters(routers);
    }
    if (routers.length > 0) {
        const r = routers[0];
        mikrotik = new MikrotikService(r.host, r.user, r.password);
        try {
            if (await mikrotik.checkConnection()) {
                activeRouterId = r.id;
                console.log('Auto-connected to router:', r.name);
            } else { mikrotik = null; }
        } catch (e) { mikrotik = null; }
    }
})();

const requireRouter = (req, res, next) => {
    if (!mikrotik) {
        return res.status(400).json({ error: 'No router connected. Please connect to a router first.' });
    }
    next();
};

app.get('/api/routers', async (req, res) => {
    const routers = await getRouters();
    res.json(routers.map(r => ({
        id: r.id, name: r.name, host: r.host, user: r.user, isActive: r.id === activeRouterId
    })));
});

app.post('/api/routers', async (req, res) => {
    try {
        const { name, host, user, password } = req.body;
        const routers = await getRouters();
        const newRouter = { id: Date.now().toString(), name, host, user, password };
        routers.push(newRouter);
        await saveRouters(routers);
        res.json({ success: true, router: { id: newRouter.id, name, host, user, isActive: false } });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/routers/:id', async (req, res) => {
    try {
        let routers = await getRouters();
        routers = routers.filter(r => r.id !== req.params.id);
        await saveRouters(routers);
        if (activeRouterId === req.params.id) {
            if (mikrotik) await mikrotik.disconnect().catch(() => { });
            mikrotik = null; activeRouterId = null;
        }
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/routers/connect', async (req, res) => {
    try {
        const { id } = req.body;
        const routers = await getRouters();
        const r = routers.find(r => r.id === id);
        if (!r) return res.status(404).json({ error: 'Router not found' });

        let newMikrotik = new MikrotikService(r.host, r.user, r.password);
        if (await newMikrotik.checkConnection()) {
            if (mikrotik) await mikrotik.disconnect().catch(() => { });
            mikrotik = newMikrotik;
            activeRouterId = r.id;
            res.json({ success: true, message: 'Connected to ' + r.name });
        } else {
            res.status(500).json({ error: 'Failed to connect. Check credentials and router address.' });
        }
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/routers/disconnect', async (req, res) => {
    if (mikrotik) {
        await mikrotik.disconnect().catch(() => { });
        mikrotik = null; activeRouterId = null;
    }
    res.json({ success: true, message: 'Disconnected' });
});

app.get('/api/status', async (req, res) => {
    if (!mikrotik) return res.json({ connected: false });
    try {
        res.json({ connected: await mikrotik.checkConnection() });
    } catch (error) { res.status(500).json({ error: error.message }); }
});

app.get('/api/profiles', requireRouter, async (req, res) => {
    try { res.json(await mikrotik.getProfiles()); }
    catch (error) { res.status(500).json({ error: error.message }); }
});

app.post('/api/profiles', requireRouter, async (req, res) => {
    try {
        const { name, rateLimit, sharedUsers, price, validity, dataLimit } = req.body;
        await mikrotik.createProfile(name, rateLimit, sharedUsers, price, validity, dataLimit);
        res.json({ success: true, message: 'Profile created' });
    } catch (error) { res.status(500).json({ error: error.message }); }
});
app.delete('/api/profiles/:id', requireRouter, async (req, res) => {
    try {
        await mikrotik.deleteProfile(req.params.id);
        res.json({ success: true, message: 'Profile deleted' });
    } catch (error) { res.status(500).json({ error: error.message }); }
});

app.put('/api/profiles/:id', requireRouter, async (req, res) => {
    try {
        const { name, rateLimit, sharedUsers, price, validity, dataLimit } = req.body;
        await mikrotik.updateProfile(req.params.id, name, rateLimit, sharedUsers, price, validity, dataLimit);
        res.json({ success: true, message: 'Profile updated' });
    } catch (error) { res.status(500).json({ error: error.message }); }
});


app.get('/api/vouchers', requireRouter, async (req, res) => {
    try { res.json(await mikrotik.getUsers()); }
    catch (error) { res.status(500).json({ error: error.message }); }
});

app.post('/api/vouchers/generate', requireRouter, async (req, res) => {
    try {
        const { count, profile, prefix, length } = req.body;
        res.json({ success: true, vouchers: await mikrotik.generateVouchers(count, profile, prefix, length) });
    } catch (error) { res.status(500).json({ error: error.message }); }
});

app.delete('/api/vouchers/:id', requireRouter, async (req, res) => {
    try {
        await mikrotik.deleteUser(req.params.id);
        res.json({ success: true, message: 'Voucher deleted' });
    } catch (error) { res.status(500).json({ error: error.message }); }
});

app.get('/api/active-sessions', requireRouter, async (req, res) => {
    try { res.json(await mikrotik.getActiveUsers()); }
    catch (error) { res.status(500).json({ error: error.message }); }
});

app.delete('/api/active-sessions/:id', requireRouter, async (req, res) => {
    try {
        await mikrotik.kickActiveUser(req.params.id);
        res.json({ success: true, message: 'User disconnected' });
    } catch (error) { res.status(500).json({ error: error.message }); }
});

app.get('/api/system/resources', requireRouter, async (req, res) => {
    try { res.json(await mikrotik.getSystemResources()); }
    catch (error) { res.status(500).json({ error: error.message }); }
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server is running! You can access it on your browser:`);
    console.log(`- Local: http://localhost:${PORT}`);

    const { networkInterfaces } = require('os');
    const nets = networkInterfaces();
    for (const name of Object.keys(nets)) {
        for (const net of nets[name]) {
            // Skip over non-IPv4 and internal (i.e. 127.0.0.1) addresses
            if (net.family === 'IPv4' && !net.internal) {
                console.log(`- Network: http://${net.address}:${PORT}`);
            }
        }
    }
});
