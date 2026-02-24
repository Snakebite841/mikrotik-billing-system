const { RouterOSAPI } = require('node-routeros');

class MikrotikService {
    constructor(host, user, password) {
        this.host = host;
        this.user = user;
        this.password = password;
        this.api = new RouterOSAPI({
            host: this.host,
            user: this.user,
            password: this.password,
            port: 8728,
            timeout: 5000,
        });
    }

    async connect() {
        if (!this.api.connected) {
            await this.api.connect();
        }
        return this.api;
    }

    async disconnect() {
        if (this.api.connected) {
            this.api.close();
        }
    }

    async checkConnection() {
        try {
            await this.connect();
            await this.disconnect();
            return true;
        } catch (error) {
            console.error('Mikrotik Connection Error:', error);
            return false;
        }
    }

    /**
     * Get all currently configured Hotspot User Profiles.
     * These will act as our 'Bandwidth Packages'.
     */
    async getProfiles() {
        try {
            const conn = await this.connect();
            const profiles = await conn.write('/ip/hotspot/user/profile/print');
            return profiles.map(p => {
                let metadata = { price: 0, validity: '', dataLimit: '' };
                try {
                    if (p.comment) {
                        metadata = JSON.parse(p.comment);
                    }
                } catch (e) { }

                return {
                    id: p['.id'],
                    name: p.name,
                    rateLimit: p['rate-limit'] || 'Unlimited',
                    sharedUsers: p['shared-users'] || 1,
                    price: metadata.price || 0,
                    validity: metadata.validity || '',
                    dataLimit: metadata.dataLimit || ''
                };
            });
        } catch (error) {
            console.error('Error fetching profiles:', error);
            throw error;
        } finally {
            await this.disconnect();
        }
    }

    /**
     * Create a new Hotspot User Profile (Bandwidth Package)
     */
    async createProfile(name, rateLimit, sharedUsers = 1, price = 0, validity = '', dataLimit = '') {
        try {
            const conn = await this.connect();
            const metadata = JSON.stringify({ price, validity, dataLimit });

            const addParams = [
                `=name=${name}`,
                `=shared-users=${sharedUsers}`,
                `=comment=${metadata}`
            ];
            if (rateLimit) {
                addParams.push(`=rate-limit=${rateLimit}`);
            }

            const result = await conn.write('/ip/hotspot/user/profile/add', addParams);
            return result;
        } catch (error) {
            console.error('Error creating profile:', error);
            throw error;
        } finally {
            await this.disconnect();
        }
    }

    /**
     * Delete a Hotspot User Profile
     */
    async deleteProfile(id) {
        try {
            const conn = await this.connect();
            const result = await conn.write('/ip/hotspot/user/profile/remove', [
                `=.id=${id}`
            ]);
            return result;
        } catch (error) {
            console.error('Error deleting profile:', error);
            throw error;
        } finally {
            await this.disconnect();
        }
    }

    /**
     * Update a Hotspot User Profile
     */
    async updateProfile(id, name, rateLimit, sharedUsers = 1, price = 0, validity = '', dataLimit = '') {
        try {
            const conn = await this.connect();
            const metadata = JSON.stringify({ price, validity, dataLimit });

            const setParams = [
                `=.id=${id}`,
                `=name=${name}`,
                `=shared-users=${sharedUsers}`,
                `=comment=${metadata}`
            ];

            // If rateLimit is empty string, we want to clear it in Mikrotik? Actually Mikrotik set might need us to omit or empty it.
            // Mikrotik accepts empty string to reset if supported, let's just pass it or omit it. Oh we can pass empty to overwrite.
            setParams.push(`=rate-limit=${rateLimit || ''}`);

            const result = await conn.write('/ip/hotspot/user/profile/set', setParams);
            return result;
        } catch (error) {
            console.error('Error updating profile:', error);
            throw error;
        } finally {
            await this.disconnect();
        }
    }

    /**
     * Get all Hotspot Users (Vouchers)
     */
    async getUsers() {
        try {
            const conn = await this.connect();
            const users = await conn.write('/ip/hotspot/user/print');
            return users.map(u => ({
                id: u['.id'],
                name: u.name,
                profile: u.profile,
                uptime: u.uptime,
                bytesIn: u['bytes-in'],
                bytesOut: u['bytes-out'],
                comment: u.comment || ''
            }));
        } catch (error) {
            console.error('Error fetching users:', error);
            throw error;
        } finally {
            await this.disconnect();
        }
    }

    /**
     * Delete a Hotspot User (Voucher)
     */
    async deleteUser(id) {
        try {
            const conn = await this.connect();
            const result = await conn.write('/ip/hotspot/user/remove', [
                `=.id=${id}`
            ]);
            return result;
        } catch (error) {
            console.error('Error deleting user:', error);
            throw error;
        } finally {
            await this.disconnect();
        }
    }

    /**
     * Batch create Hotspot Users (Generate Vouchers)
     */
    async generateVouchers(count, profile, prefix = '', length = 6) {
        try {
            const conn = await this.connect();
            const created = [];
            const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

            // Get profile details to apply limits if present
            let limitUptime = '';
            let limitBytes = '';
            const profiles = await conn.write('/ip/hotspot/user/profile/print');
            const targetProfile = profiles.find(p => p.name === profile);
            if (targetProfile && targetProfile.comment) {
                try {
                    const meta = JSON.parse(targetProfile.comment);
                    if (meta.validity) limitUptime = meta.validity;
                    if (meta.dataLimit) limitBytes = meta.dataLimit;
                } catch (e) { }
            }

            for (let i = 0; i < count; i++) {
                let code = prefix;
                for (let j = 0; j < length; j++) {
                    code += characters.charAt(Math.floor(Math.random() * characters.length));
                }

                const addParams = [
                    `=name=${code}`,
                    `=password=${code}`,
                    `=profile=${profile}`,
                    `=comment=Generated Voucher`
                ];

                if (limitUptime) addParams.push(`=limit-uptime=${limitUptime}`);
                if (limitBytes) addParams.push(`=limit-bytes-total=${limitBytes}`);

                await conn.write('/ip/hotspot/user/add', addParams);
                created.push(code);
            }
            return created;
        } catch (error) {
            console.error('Error generating vouchers:', error);
            throw error;
        } finally {
            await this.disconnect();
        }
    }

    /**
     * Get real-time Active Hotspot Sessions
     */
    async getActiveUsers() {
        try {
            const conn = await this.connect();
            const activeUsers = await conn.write('/ip/hotspot/active/print');
            return activeUsers.map(u => ({
                id: u['.id'],
                user: u.user,
                address: u.address,
                macAddress: u['mac-address'],
                uptime: u.uptime,
                bytesIn: u['bytes-in'],
                bytesOut: u['bytes-out']
            }));
        } catch (error) {
            console.error('Error fetching active users:', error);
            throw error;
        } finally {
            await this.disconnect();
        }
    }

    /**
     * Kick/Disconnect an active session
     */
    async kickActiveUser(id) {
        try {
            const conn = await this.connect();
            const result = await conn.write('/ip/hotspot/active/remove', [
                `=.id=${id}`
            ]);
            return result;
        } catch (error) {
            console.error('Error kicking user:', error);
            throw error;
        } finally {
            await this.disconnect();
        }
    }

    /**
     * Get system resources (CPU, Memory, Disk)
     */
    async getSystemResources() {
        try {
            const conn = await this.connect();
            const resources = await conn.write('/system/resource/print');
            if (resources.length > 0) {
                const sys = resources[0];
                return {
                    cpuLoad: sys['cpu-load'] || 0,
                    freeMemory: sys['free-memory'] || 0,
                    totalMemory: sys['total-memory'] || 0,
                    freeHdd: sys['free-hdd-space'] || 0,
                    totalHdd: sys['total-hdd-space'] || 0,
                    boardName: sys['board-name'] || 'RouterBoard',
                    uptime: sys.uptime
                };
            }
            return null;
        } catch (error) {
            console.error('Error fetching system resources:', error);
            throw error;
        } finally {
            await this.disconnect();
        }
    }
}

module.exports = MikrotikService;
