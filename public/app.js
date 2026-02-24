const API_URL = '/api';

const app = {
    state: {
        profiles: [],
        vouchers: [],
        routers: [],
        isConnected: false
    },

    init() {
        this.bindEvents();
        this.checkConnection();
        // Fallback polling for connection status
        setInterval(() => this.checkConnection(), 30000);
    },

    bindEvents() {
        // Navigation
        document.querySelectorAll('.nav-item').forEach(item => {
            item.addEventListener('click', (e) => {
                e.preventDefault();
                const view = e.currentTarget.dataset.view;
                this.switchView(view);
            });
        });

        // Forms
        document.getElementById('generate-form').addEventListener('submit', (e) => {
            e.preventDefault();
            this.generateVouchers();
        });

        document.getElementById('profile-form').addEventListener('submit', (e) => {
            e.preventDefault();
            this.createProfile();
        });

        document.getElementById('router-form').addEventListener('submit', (e) => {
            e.preventDefault();
            this.addRouter();
        });
    },

    switchView(viewId) {
        // Update Nav
        document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));
        document.querySelector(`[data-view="${viewId}"]`).classList.add('active');

        // Update View
        document.querySelectorAll('.view-section').forEach(section => section.classList.remove('active'));
        document.getElementById(`${viewId}-view`).classList.add('active');

        // Load data based on view
        if (viewId === 'dashboard') {
            this.updateDashboard();
            this.loadSystemResources();
        } else if (viewId === 'vouchers') {
            this.loadVouchers();
        } else if (viewId === 'profiles') {
            this.loadProfiles();
        } else if (viewId === 'active-sessions') {
            this.loadActiveSessions();
        } else if (viewId === 'routers') {
            this.loadRouters();
        }
    },

    // Modals
    openModal(modalId) {
        const modal = document.getElementById(modalId);
        modal.classList.add('active');

        // If opening generate, populate profiles dropdown
        if (modalId === 'generate-modal') {
            this.populateProfilesDropdown();
        }
    },

    closeModal(modalId) {
        document.getElementById(modalId).classList.remove('active');
        // Reset forms
        if (modalId === 'generate-modal') document.getElementById('generate-form').reset();
        if (modalId === 'profile-modal') {
            document.getElementById('profile-form').reset();
            document.getElementById('profile-id').value = '';
            document.getElementById('profile-modal-title').textContent = 'Create Bandwidth Profile';
            document.getElementById('profile-submit-btn').textContent = 'Create Profile';
        }
        if (modalId === 'router-modal') document.getElementById('router-form').reset();
    },

    // Toast Notifications
    showToast(message, type = 'success') {
        const container = document.getElementById('toast-container');
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;

        const icon = type === 'success' ? 'checkmark-circle-outline' : 'alert-circle-outline';
        toast.innerHTML = `<ion-icon name="${icon}"></ion-icon> <span>${message}</span>`;

        container.appendChild(toast);

        // Remove after 3 seconds
        setTimeout(() => {
            toast.style.opacity = '0';
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    },

    // API Calls
    async checkConnection() {
        try {
            const res = await fetch(`${API_URL}/status`);
            const data = await res.json();
            this.state.isConnected = data.connected;
            this.updateConnectionStatus();

            if (this.state.isConnected) {
                // Initial data load
                this.loadProfiles();
                this.loadVouchers();
            }
        } catch (error) {
            console.error('Connection check failed:', error);
            this.state.isConnected = false;
            this.updateConnectionStatus();
        }
    },

    updateConnectionStatus() {
        const indicator = document.getElementById('status-indicator');
        const text = document.getElementById('status-text');

        if (this.state.isConnected) {
            indicator.className = 'status-indicator online';
            text.textContent = 'Router Connected';
        } else {
            indicator.className = 'status-indicator offline';
            text.textContent = 'Disconnected';
        }
    },

    // --- Routers Logic ---
    async loadRouters() {
        try {
            const res = await fetch(`${API_URL}/routers`);
            this.state.routers = await res.json();
            this.renderRouters();
        } catch (error) {
            this.showToast('Failed to load routers', 'error');
        }
    },

    async addRouter() {
        const name = document.getElementById('router-name').value;
        const host = document.getElementById('router-host').value;
        const user = document.getElementById('router-user').value;
        const password = document.getElementById('router-pass').value;

        try {
            const res = await fetch(`${API_URL}/routers`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, host, user, password })
            });

            if (res.ok) {
                this.showToast('Router added successfully');
                this.closeModal('router-modal');
                this.loadRouters();
            } else {
                const data = await res.json();
                throw new Error(data.error || 'Failed to add router');
            }
        } catch (error) {
            this.showToast(error.message, 'error');
        }
    },

    async deleteRouter(id) {
        if (!confirm('Are you sure you want to delete this router?')) return;
        try {
            const res = await fetch(`${API_URL}/routers/${id}`, { method: 'DELETE' });
            if (res.ok) {
                this.showToast('Router deleted');
                this.loadRouters();
                this.checkConnection();
            } else {
                throw new Error('Failed to delete router');
            }
        } catch (error) {
            this.showToast(error.message, 'error');
        }
    },

    async connectRouter(id) {
        this.showToast('Connecting to router...', 'success');
        try {
            const res = await fetch(`${API_URL}/routers/connect`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id })
            });

            const data = await res.json();
            if (res.ok && data.success) {
                this.showToast(data.message);
                this.loadRouters();
                await this.checkConnection();
                if (this.state.isConnected) {
                    this.switchView('dashboard');
                }
            } else {
                throw new Error(data.error || 'Failed to connect');
            }
        } catch (error) {
            this.showToast(error.message, 'error');
        }
    },

    renderRouters() {
        const tbody = document.getElementById('routers-table-body');
        if (!tbody) return;
        tbody.innerHTML = '';

        if (this.state.routers.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--text-muted);">No routers found</td></tr>';
            return;
        }

        this.state.routers.forEach(r => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><strong>${r.name}</strong></td>
                <td>${r.host}</td>
                <td>${r.user}</td>
                <td>
                    ${r.isActive
                    ? '<span class="badge" style="background:#10b981;">Active</span>'
                    : '<span class="badge" style="background:var(--text-muted);">Inactive</span>'}
                </td>
                <td>
                    ${!r.isActive ? `
                    <button class="btn btn-primary btn-small" onclick="app.connectRouter('${r.id}')">
                        <ion-icon name="link-outline"></ion-icon> Connect
                    </button>
                    ` : ''}
                    <button class="btn btn-danger btn-small" onclick="app.deleteRouter('${r.id}')">
                        <ion-icon name="trash-outline"></ion-icon>
                    </button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    },
    // --- End Routers Logic ---

    async loadProfiles() {
        if (!this.state.isConnected) return;
        try {
            const res = await fetch(`${API_URL}/profiles`);
            this.state.profiles = await res.json();
            this.renderProfiles();
            this.updateDashboard();
        } catch (error) {
            this.showToast('Failed to load profiles', 'error');
        }
    },

    async loadVouchers() {
        if (!this.state.isConnected) return;
        try {
            const res = await fetch(`${API_URL}/vouchers`);
            this.state.vouchers = await res.json();
            this.renderVouchers();
            this.updateDashboard();
        } catch (error) {
            this.showToast('Failed to load vouchers', 'error');
        }
    },

    async createProfile() {
        const id = document.getElementById('profile-id').value;
        const name = document.getElementById('profile-name').value;
        const rateLimit = document.getElementById('profile-limit').value;
        const sharedUsers = document.getElementById('profile-shared').value;
        const price = parseFloat(document.getElementById('profile-price').value) || 0;
        const validity = document.getElementById('profile-validity').value;
        const dataLimit = document.getElementById('profile-data').value;

        try {
            let res;
            if (id) {
                // Update existing profile
                res = await fetch(`${API_URL}/profiles/${id}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name, rateLimit, sharedUsers, price, validity, dataLimit })
                });
            } else {
                // Create new profile
                res = await fetch(`${API_URL}/profiles`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name, rateLimit, sharedUsers, price, validity, dataLimit })
                });
            }

            if (res.ok) {
                this.showToast(`Profile ${id ? 'updated' : 'created'} successfully`);
                this.closeModal('profile-modal');
                this.loadProfiles();
            } else {
                throw new Error(`Failed to ${id ? 'update' : 'create'}`);
            }
        } catch (error) {
            this.showToast(`Error ${id ? 'updating' : 'creating'} profile`, 'error');
        }
    },

    async generateVouchers() {
        const count = parseInt(document.getElementById('voucher-count').value);
        const profile = document.getElementById('voucher-profile').value;
        const prefix = document.getElementById('voucher-prefix').value;
        const length = parseInt(document.getElementById('voucher-length').value);

        try {
            const res = await fetch(`${API_URL}/vouchers/generate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ count, profile, prefix, length })
            });

            if (res.ok) {
                this.showToast(`${count} vouchers generated successfully`);
                this.closeModal('generate-modal');
                this.loadVouchers();
            } else {
                throw new Error('Failed to generate');
            }
        } catch (error) {
            this.showToast('Error generating vouchers', 'error');
        }
    },

    async deleteVoucher(id) {
        if (!confirm('Are you sure you want to delete this voucher?')) return;

        try {
            const res = await fetch(`${API_URL}/vouchers/${id}`, {
                method: 'DELETE'
            });

            if (res.ok) {
                this.showToast('Voucher deleted');
                this.loadVouchers();
            } else {
                throw new Error('Failed to delete');
            }
        } catch (error) {
            this.showToast('Error deleting voucher', 'error');
        }
    },

    async deleteProfile(id) {
        if (!confirm('Are you sure you want to delete this profile?')) return;

        try {
            const res = await fetch(`${API_URL}/profiles/${id}`, {
                method: 'DELETE'
            });

            if (res.ok) {
                this.showToast('Profile deleted');
                this.loadProfiles();
            } else {
                throw new Error('Failed to delete profile');
            }
        } catch (error) {
            this.showToast('Error deleting profile', 'error');
        }
    },

    editProfile(id) {
        const profile = this.state.profiles.find(p => p.id === id);
        if (!profile) return;

        document.getElementById('profile-id').value = profile.id;
        document.getElementById('profile-name').value = profile.name;
        document.getElementById('profile-limit').value = profile.rateLimit !== 'Unlimited' ? profile.rateLimit : '';
        document.getElementById('profile-shared').value = profile.sharedUsers;
        document.getElementById('profile-price').value = profile.price || 0;
        document.getElementById('profile-validity').value = profile.validity || '';
        document.getElementById('profile-data').value = profile.dataLimit || '';

        document.getElementById('profile-modal-title').textContent = 'Edit Bandwidth Profile';
        document.getElementById('profile-submit-btn').textContent = 'Update Profile';

        this.openModal('profile-modal');
    },

    // Rendering
    updateDashboard() {
        document.getElementById('stat-vouchers').textContent = this.state.vouchers.length || 0;
        document.getElementById('stat-profiles').textContent = this.state.profiles.length || 0;

        let totalRevenue = 0;
        this.state.vouchers.forEach(v => {
            const profile = this.state.profiles.find(p => p.name === v.profile);
            if (profile && profile.price) {
                totalRevenue += parseFloat(profile.price);
            }
        });
        document.getElementById('stat-revenue').textContent = `GH₵${totalRevenue.toFixed(2)}`;
    },

    renderProfiles() {
        const tbody = document.getElementById('profiles-table-body');
        tbody.innerHTML = '';

        if (this.state.profiles.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--text-muted);">No profiles found</td></tr>';
            return;
        }

        this.state.profiles.forEach(p => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><strong>${p.name || 'N/A'}</strong></td>
                <td><span class="badge">${p.rateLimit || 'Unlimited'}</span></td>
                <td><strong>GH₵${p.price || 0}</strong></td>
                <td>${p.validity || '-'}</td>
                <td>${p.dataLimit || '-'}</td>
                <td>${p.sharedUsers || 1}</td>
                <td>
                    <button class="btn btn-secondary btn-small" onclick="app.editProfile('${p.id}')">
                        <ion-icon name="create-outline"></ion-icon>
                    </button>
                    <button class="btn btn-danger btn-small" onclick="app.deleteProfile('${p.id}')">
                        <ion-icon name="trash-outline"></ion-icon>
                    </button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    },

    renderVouchers() {
        const tbody = document.getElementById('vouchers-table-body');
        tbody.innerHTML = '';

        if (this.state.vouchers.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--text-muted);">No vouchers found</td></tr>';
            return;
        }

        // Sort by ID descending (newest first)
        const sortedVouchers = [...this.state.vouchers].reverse();

        sortedVouchers.forEach(v => {
            // Hotspot converts bytes to readable string if we want, but default is raw bytes.
            const formatBytes = (bytes) => {
                if (!bytes) return '0 B';
                const k = 1024;
                const sizes = ['B', 'KB', 'MB', 'GB'];
                const i = Math.floor(Math.log(bytes) / Math.log(k));
                return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
            };

            const bytesIn = formatBytes(v.bytesIn);
            const bytesOut = formatBytes(v.bytesOut);

            const prof = this.state.profiles.find(p => p.name === v.profile) || {};
            const priceStr = prof.price ? `GH₵${prof.price}` : 'Free';
            const validStr = prof.validity || 'Unlimited';

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>
                    <div class="print-only" style="font-size:1.2rem; font-weight:700; margin-bottom:10px; text-align:center; color: var(--primary);">TRANS-AI-GLOBA-NET Wi-Fi</div>
                    <div class="print-only" style="text-align:center; margin-bottom:5px;">Code / PIN</div>
                    <strong style="font-size:1.2rem; letter-spacing:1px; display:block; text-align:center;">${v.name || 'Unknown'}</strong>
                    <div class="print-only" style="text-align:center; margin-top:10px; font-size:0.9rem;">
                        <strong>Price:</strong> ${priceStr} <br>
                        <strong>Validity:</strong> ${validStr}
                    </div>
                </td>
                <td><span class="badge">${v.profile || 'default'}</span></td>
                <td class="no-print">${v.uptime || '00:00:00'}</td>
                <td class="no-print"><small>&#8595; ${bytesIn} / &#8593; ${bytesOut}</small></td>
                <td class="no-print">
                    <button class="btn btn-danger btn-small" onclick="app.deleteVoucher('${v.id}')">
                        <ion-icon name="trash-outline"></ion-icon>
                    </button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    },

    populateProfilesDropdown() {
        const select = document.getElementById('voucher-profile');
        select.innerHTML = '<option value="">-- Select Profile --</option>';

        this.state.profiles.forEach(p => {
            if (p.name !== 'default') {
                const opt = document.createElement('option');
                opt.value = p.name;
                opt.textContent = p.name;
                select.appendChild(opt);
            }
        });

        // Add default profile at the bottom if not added
        const defaultExists = this.state.profiles.find(p => p.name === 'default');
        if (defaultExists) {
            const opt = document.createElement('option');
            opt.value = 'default';
            opt.textContent = 'default';
            select.appendChild(opt);
        }
    },

    // --- Phase 2: Advanced Features ---

    async loadActiveSessions() {
        if (!this.state.isConnected) return;
        try {
            const res = await fetch(`${API_URL}/active-sessions`);
            this.state.activeSessions = await res.json();
            this.renderActiveSessions();
        } catch (error) {
            this.showToast('Failed to load active sessions', 'error');
        }
    },

    async loadSystemResources() {
        if (!this.state.isConnected) return;
        try {
            const res = await fetch(`${API_URL}/system/resources`);
            const sys = await res.json();
            if (sys) {
                document.getElementById('stat-cpu').textContent = `${sys.cpuLoad}%`;

                // Convert bytes to MB
                const freeRam = Math.round(sys.freeMemory / 1024 / 1024);
                document.getElementById('stat-ram').textContent = `${freeRam} MB`;
            }
        } catch (error) {
            console.error('Failed to load system resources');
        }
    },

    async kickActiveUser(id) {
        if (!confirm('Are you sure you want to disconnect this user immediately?')) return;
        try {
            const res = await fetch(`${API_URL}/active-sessions/${id}`, { method: 'DELETE' });
            if (res.ok) {
                this.showToast('User disconnected successfully');
                this.loadActiveSessions();
            } else {
                throw new Error('Failed to disconnect');
            }
        } catch (error) {
            this.showToast('Error disconnecting user', 'error');
        }
    },

    renderActiveSessions() {
        const tbody = document.getElementById('active-table-body');
        tbody.innerHTML = '';

        if (!this.state.activeSessions || this.state.activeSessions.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--text-muted);">No active users found</td></tr>';
            return;
        }

        this.state.activeSessions.forEach(session => {
            const bytesIn = this.formatBytes(session.bytesIn);
            const bytesOut = this.formatBytes(session.bytesOut);

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><strong>${session.user || 'Unknown'}</strong></td>
                <td>
                    <div style="font-size:0.9rem">${session.address || 'N/A'}</div>
                    <div style="font-size:0.8rem; color:var(--text-muted);">${session.macAddress || 'N/A'}</div>
                </td>
                <td>${session.uptime || '00:00:00'}</td>
                <td><small>&#8595; ${bytesIn} / &#8593; ${bytesOut}</small></td>
                <td>
                    <button class="btn btn-warning btn-small" onclick="app.kickActiveUser('${session.id}')" title="Kick User" style="background: rgba(245, 158, 11, 0.2); color: #f59e0b; border: 1px solid rgba(245, 158, 11, 0.3);">
                        <ion-icon name="log-out-outline"></ion-icon> Force Disconnect
                    </button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    },

    exportVouchersCSV() {
        if (!this.state.vouchers || this.state.vouchers.length === 0) {
            this.showToast('No vouchers to export', 'error');
            return;
        }

        // CSV Header
        let csvContent = "data:text/csv;charset=utf-8,";
        csvContent += "Username/Password,Profile,Uptime,Data In,Data Out,Comment\n";

        // Rows
        this.state.vouchers.forEach(v => {
            const row = [
                v.name,
                v.profile,
                v.uptime || '0s',
                v.bytesIn || '0',
                v.bytesOut || '0',
                v.comment || ''
            ].join(",");
            csvContent += row + "\n";
        });

        // Trigger Download
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", `vouchers_export_${new Date().toISOString().slice(0, 10)}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    },

    printVouchers() {
        window.print();
    },

    formatBytes(bytes) {
        if (!bytes) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }
};

// Initialize app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    app.init();
});
