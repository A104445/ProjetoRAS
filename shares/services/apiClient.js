/**
 * Internal API Client
 * 
 * This module provides HTTP clients for communicating with other microservices
 * within the Docker network. This follows proper microservice architecture
 * where services communicate via APIs, not direct database access.
 */

const axios = require('axios');
const https = require('https');

// Configure axios to accept self-signed certificates (internal network)
const httpsAgent = new https.Agent({
    rejectUnauthorized: false
});

// Service URLs (internal Docker network)
const PROJECTS_SERVICE = process.env.PROJECTS_SERVICE_URL || 'https://projects:9001';
const USERS_SERVICE = process.env.USERS_SERVICE_URL || 'https://users:10001';

// Create axios instances for each service
const projectsClient = axios.create({
    baseURL: PROJECTS_SERVICE,
    httpsAgent,
    timeout: 10000
});

const usersClient = axios.create({
    baseURL: USERS_SERVICE,
    httpsAgent,
    timeout: 10000
});

/**
 * Projects Service Client
 */
const ProjectsAPI = {
    /**
     * Get a project by ID
     * @param {string} userId - User ID (owner)
     * @param {string} projectId - Project ID
     * @returns {Promise<object|null>} Project data or null if not found
     */
    async getProject(userId, projectId) {
        try {
            const response = await projectsClient.get(`/${userId}/${projectId}`);
            return response.data;
        } catch (error) {
            if (error.response?.status === 404 || error.response?.status === 500) {
                return null;
            }
            console.error(`Error fetching project ${projectId}:`, error.message);
            throw error;
        }
    },

    /**
     * Get a project by ID only (without requiring userId)
     * Uses internal endpoint for inter-service communication
     * @param {string} projectId - Project ID
     * @returns {Promise<object|null>} Project data or null if not found
     */
    async getProjectById(projectId) {
        try {
            const response = await projectsClient.get(`/internal/project/${projectId}`);
            return response.data;
        } catch (error) {
            if (error.response?.status === 404) {
                return null;
            }
            console.error(`Error fetching project ${projectId}:`, error.message);
            return null;
        }
    },

    /**
     * Verify project ownership
     * @param {string} projectId - Project ID
     * @param {string} userId - User ID to check ownership
     * @returns {Promise<object>} Ownership verification result
     */
    async verifyProjectOwnership(projectId, userId) {
        try {
            const response = await projectsClient.get(`/internal/project/${projectId}/owner/${userId}`);
            return response.data;
        } catch (error) {
            console.error(`Error verifying ownership:`, error.message);
            return { exists: false, isOwner: false };
        }
    },

    /**
     * Get all projects for a user
     * @param {string} userId - User ID
     * @returns {Promise<Array>} List of projects
     */
    async getUserProjects(userId) {
        try {
            const response = await projectsClient.get(`/${userId}`);
            return response.data || [];
        } catch (error) {
            console.error(`Error fetching projects for user ${userId}:`, error.message);
            return [];
        }
    },

    /**
     * Verify if user owns a project
     * @param {string} userId - User ID
     * @param {string} projectId - Project ID
     * @returns {Promise<boolean>} True if user owns the project
     */
    async verifyOwnership(userId, projectId) {
        try {
            const project = await this.getProject(userId, projectId);
            return project !== null;
        } catch (error) {
            return false;
        }
    },

    /**
     * Add permission to a project
     * @param {string} projectId - Project ID
     * @param {string} userId - User ID to grant permission
     * @param {string} role - "edit" or "view"
     * @returns {Promise<object|null>} Result or null on error
     */
    async addPermission(projectId, userId, role) {
        try {
            const response = await projectsClient.post(
                `/internal/project/${projectId}/permissions`,
                { userId, role }
            );
            return response.data;
        } catch (error) {
            console.error(`Error adding permission:`, error.message);
            return null;
        }
    },

    /**
     * Remove permission from a project
     * @param {string} projectId - Project ID
     * @param {string} userId - User ID to remove permission
     * @returns {Promise<object|null>} Result or null on error
     */
    async removePermission(projectId, userId) {
        try {
            const response = await projectsClient.delete(
                `/internal/project/${projectId}/permissions/${userId}`
            );
            return response.data;
        } catch (error) {
            console.error(`Error removing permission:`, error.message);
            return null;
        }
    },

    /**
     * Check permission for a project
     * @param {string} projectId - Project ID
     * @param {string} userId - User ID
     * @returns {Promise<object>} { hasAccess: boolean, role: string|null }
     */
    async checkPermission(projectId, userId) {
        try {
            const response = await projectsClient.get(
                `/internal/project/${projectId}/permissions/${userId}`
            );
            return response.data;
        } catch (error) {
            console.error(`Error checking permission:`, error.message);
            return { hasAccess: false, role: null };
        }
    }
};

/**
 * Users Service Client
 */
const UsersAPI = {
    /**
     * Get a user by ID
     * @param {string} userId - User ID
     * @returns {Promise<object|null>} User data or null if not found
     */
    async getUser(userId) {
        try {
            const response = await usersClient.get(`/${userId}`);
            return response.data;
        } catch (error) {
            if (error.response?.status === 404 || error.response?.status === 701) {
                return null;
            }
            console.error(`Error fetching user ${userId}:`, error.message);
            return null;
        }
    },

    /**
     * Get user by email
     * @param {string} email - User email
     * @returns {Promise<object|null>} User data or null if not found
     */
    async getUserByEmail(email) {
        try {
            const response = await usersClient.get(`/email/${email}`);
            return response.data;
        } catch (error) {
            return null;
        }
    },

    /**
     * Validate user token
     * @param {string} userId - User ID
     * @param {string} token - JWT token
     * @returns {Promise<object|null>} Validation result or null
     */
    async validateToken(userId, token) {
        try {
            const response = await usersClient.get(`/validate/${userId}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            return response.data;
        } catch (error) {
            return null;
        }
    }
};

module.exports = {
    ProjectsAPI,
    UsersAPI,
    projectsClient,
    usersClient
};
