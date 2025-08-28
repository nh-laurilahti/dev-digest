import { db } from '../db';
import { logger } from '../lib/logger';
import { PERMISSIONS, ROLES, Permission } from '../lib/auth';
import {
  NotFoundError,
  ConflictError,
  ValidationError,
} from '../lib/errors';

// Types
export interface RoleWithPermissions {
  id: number;
  name: string;
  description: string | null;
  permissions: string[];
}

export interface CreateRoleData {
  name: string;
  description?: string;
  permissions: string[];
}

export interface UpdateRoleData {
  name?: string;
  description?: string;
  permissions?: string[];
}

export interface UserRoleAssignment {
  userId: number;
  roleId: number;
  assignedAt: Date;
}

class PermissionService {
  /**
   * Get all available permissions
   */
  getAvailablePermissions(): Permission[] {
    return Object.values(PERMISSIONS);
  }

  /**
   * Get default roles configuration
   */
  getDefaultRoles(): typeof ROLES {
    return ROLES;
  }

  /**
   * Validate permissions array
   */
  validatePermissions(permissions: string[]): boolean {
    const validPermissions = this.getAvailablePermissions();
    return permissions.every(permission => validPermissions.includes(permission as Permission));
  }

  /**
   * Create a new role
   */
  async createRole(data: CreateRoleData): Promise<RoleWithPermissions> {
    try {
      // Validate permissions
      if (!this.validatePermissions(data.permissions)) {
        throw new ValidationError('Invalid permissions provided');
      }

      // Check if role name already exists
      const existingRole = await db.role.findUnique({
        where: { name: data.name },
      });

      if (existingRole) {
        throw new ConflictError('Role name already exists');
      }

      // Create role
      const role = await db.role.create({
        data: {
          name: data.name,
          description: data.description || null,
          permissions: JSON.stringify(data.permissions),
        },
      });

      logger.info({ roleId: role.id, name: data.name }, 'Role created');

      return {
        id: role.id,
        name: role.name,
        description: role.description,
        permissions: JSON.parse(role.permissions),
      };
    } catch (error) {
      logger.error({ error, name: data.name }, 'Failed to create role');
      throw error;
    }
  }

  /**
   * Get all roles
   */
  async getRoles(): Promise<RoleWithPermissions[]> {
    try {
      const roles = await db.role.findMany({
        orderBy: { name: 'asc' },
      });

      return roles.map(role => ({
        id: role.id,
        name: role.name,
        description: role.description,
        permissions: JSON.parse(role.permissions),
      }));
    } catch (error) {
      logger.error({ error }, 'Failed to get roles');
      throw error;
    }
  }

  /**
   * Get role by ID
   */
  async getRole(id: number): Promise<RoleWithPermissions | null> {
    try {
      const role = await db.role.findUnique({
        where: { id },
      });

      if (!role) {
        return null;
      }

      return {
        id: role.id,
        name: role.name,
        description: role.description,
        permissions: JSON.parse(role.permissions),
      };
    } catch (error) {
      logger.error({ error, roleId: id }, 'Failed to get role');
      throw error;
    }
  }

  /**
   * Get role by name
   */
  async getRoleByName(name: string): Promise<RoleWithPermissions | null> {
    try {
      const role = await db.role.findUnique({
        where: { name },
      });

      if (!role) {
        return null;
      }

      return {
        id: role.id,
        name: role.name,
        description: role.description,
        permissions: JSON.parse(role.permissions),
      };
    } catch (error) {
      logger.error({ error, name }, 'Failed to get role by name');
      throw error;
    }
  }

  /**
   * Update a role
   */
  async updateRole(id: number, data: UpdateRoleData): Promise<RoleWithPermissions> {
    try {
      // Check if role exists
      const existingRole = await db.role.findUnique({
        where: { id },
      });

      if (!existingRole) {
        throw new NotFoundError('Role');
      }

      // Validate permissions if provided
      if (data.permissions && !this.validatePermissions(data.permissions)) {
        throw new ValidationError('Invalid permissions provided');
      }

      // Check for name conflicts
      if (data.name && data.name !== existingRole.name) {
        const conflictingRole = await db.role.findUnique({
          where: { name: data.name },
        });

        if (conflictingRole) {
          throw new ConflictError('Role name already exists');
        }
      }

      // Update role
      const updateData: any = {};
      if (data.name !== undefined) updateData.name = data.name;
      if (data.description !== undefined) updateData.description = data.description;
      if (data.permissions !== undefined) updateData.permissions = JSON.stringify(data.permissions);

      const role = await db.role.update({
        where: { id },
        data: updateData,
      });

      logger.info({ roleId: id, changes: data }, 'Role updated');

      return {
        id: role.id,
        name: role.name,
        description: role.description,
        permissions: JSON.parse(role.permissions),
      };
    } catch (error) {
      logger.error({ error, roleId: id, data }, 'Failed to update role');
      throw error;
    }
  }

  /**
   * Delete a role
   */
  async deleteRole(id: number): Promise<void> {
    try {
      // Check if role exists
      const existingRole = await db.role.findUnique({
        where: { id },
        include: { users: true },
      });

      if (!existingRole) {
        throw new NotFoundError('Role');
      }

      // Check if role is assigned to users
      if (existingRole.users.length > 0) {
        throw new ValidationError('Cannot delete role assigned to users');
      }

      // Prevent deletion of system roles
      const systemRoles = ['admin', 'user'];
      if (systemRoles.includes(existingRole.name)) {
        throw new ValidationError('Cannot delete system role');
      }

      // Delete role
      await db.role.delete({
        where: { id },
      });

      logger.info({ roleId: id, name: existingRole.name }, 'Role deleted');
    } catch (error) {
      logger.error({ error, roleId: id }, 'Failed to delete role');
      throw error;
    }
  }

  /**
   * Assign role to user
   */
  async assignRole(userId: number, roleId: number): Promise<UserRoleAssignment> {
    try {
      // Check if user exists
      const user = await db.user.findUnique({
        where: { id: userId },
      });

      if (!user || !user.isActive) {
        throw new NotFoundError('User');
      }

      // Check if role exists
      const role = await db.role.findUnique({
        where: { id: roleId },
      });

      if (!role) {
        throw new NotFoundError('Role');
      }

      // Check if assignment already exists
      const existingAssignment = await db.userRole.findUnique({
        where: {
          userId_roleId: { userId, roleId },
        },
      });

      if (existingAssignment) {
        throw new ConflictError('Role already assigned to user');
      }

      // Create assignment
      const assignment = await db.userRole.create({
        data: { userId, roleId },
      });

      logger.info({ userId, roleId, roleName: role.name }, 'Role assigned to user');

      return {
        userId: assignment.userId,
        roleId: assignment.roleId,
        assignedAt: assignment.assignedAt,
      };
    } catch (error) {
      logger.error({ error, userId, roleId }, 'Failed to assign role');
      throw error;
    }
  }

  /**
   * Remove role from user
   */
  async removeRole(userId: number, roleId: number): Promise<void> {
    try {
      // Check if assignment exists
      const existingAssignment = await db.userRole.findUnique({
        where: {
          userId_roleId: { userId, roleId },
        },
        include: { role: true },
      });

      if (!existingAssignment) {
        throw new NotFoundError('Role assignment');
      }

      // Prevent removal of last admin role
      if (existingAssignment.role.name === 'admin') {
        const adminRoleCount = await db.userRole.count({
          where: {
            userId,
            role: { name: 'admin' },
          },
        });

        if (adminRoleCount <= 1) {
          const totalAdmins = await db.userRole.count({
            where: {
              role: { name: 'admin' },
            },
          });

          if (totalAdmins <= 1) {
            throw new ValidationError('Cannot remove the last admin role');
          }
        }
      }

      // Remove assignment
      await db.userRole.delete({
        where: {
          userId_roleId: { userId, roleId },
        },
      });

      logger.info({ userId, roleId, roleName: existingAssignment.role.name }, 'Role removed from user');
    } catch (error) {
      logger.error({ error, userId, roleId }, 'Failed to remove role');
      throw error;
    }
  }

  /**
   * Get user roles
   */
  async getUserRoles(userId: number): Promise<RoleWithPermissions[]> {
    try {
      const userRoles = await db.userRole.findMany({
        where: { userId },
        include: { role: true },
        orderBy: { assignedAt: 'asc' },
      });

      return userRoles.map(userRole => ({
        id: userRole.role.id,
        name: userRole.role.name,
        description: userRole.role.description,
        permissions: JSON.parse(userRole.role.permissions),
      }));
    } catch (error) {
      logger.error({ error, userId }, 'Failed to get user roles');
      throw error;
    }
  }

  /**
   * Get users with specific role
   */
  async getUsersWithRole(roleId: number): Promise<Array<{
    id: number;
    username: string;
    email: string;
    fullName: string | null;
    assignedAt: Date;
  }>> {
    try {
      const userRoles = await db.userRole.findMany({
        where: { roleId },
        include: { user: true },
        orderBy: { assignedAt: 'desc' },
      });

      return userRoles.map(userRole => ({
        id: userRole.user.id,
        username: userRole.user.username,
        email: userRole.user.email,
        fullName: userRole.user.fullName,
        assignedAt: userRole.assignedAt,
      }));
    } catch (error) {
      logger.error({ error, roleId }, 'Failed to get users with role');
      throw error;
    }
  }

  /**
   * Check if user has permission
   */
  async hasPermission(userId: number, permission: Permission): Promise<boolean> {
    try {
      const userRoles = await this.getUserRoles(userId);
      
      return userRoles.some(role => 
        role.permissions.includes(permission)
      );
    } catch (error) {
      logger.error({ error, userId, permission }, 'Failed to check permission');
      return false;
    }
  }

  /**
   * Check if user has role
   */
  async hasRole(userId: number, roleName: string): Promise<boolean> {
    try {
      const userRoles = await this.getUserRoles(userId);
      
      return userRoles.some(role => role.name === roleName);
    } catch (error) {
      logger.error({ error, userId, roleName }, 'Failed to check role');
      return false;
    }
  }

  /**
   * Get user permissions (aggregated from all roles)
   */
  async getUserPermissions(userId: number): Promise<string[]> {
    try {
      const userRoles = await this.getUserRoles(userId);
      const permissions = new Set<string>();

      userRoles.forEach(role => {
        role.permissions.forEach(permission => {
          permissions.add(permission);
        });
      });

      return Array.from(permissions);
    } catch (error) {
      logger.error({ error, userId }, 'Failed to get user permissions');
      throw error;
    }
  }

  /**
   * Bulk assign roles to user
   */
  async assignMultipleRoles(userId: number, roleIds: number[]): Promise<UserRoleAssignment[]> {
    try {
      // Check if user exists
      const user = await db.user.findUnique({
        where: { id: userId },
      });

      if (!user || !user.isActive) {
        throw new NotFoundError('User');
      }

      // Check if all roles exist
      const roles = await db.role.findMany({
        where: { id: { in: roleIds } },
      });

      if (roles.length !== roleIds.length) {
        throw new ValidationError('One or more roles not found');
      }

      // Get existing assignments
      const existingAssignments = await db.userRole.findMany({
        where: { userId, roleId: { in: roleIds } },
      });

      const existingRoleIds = existingAssignments.map(a => a.roleId);
      const newRoleIds = roleIds.filter(id => !existingRoleIds.includes(id));

      if (newRoleIds.length === 0) {
        throw new ConflictError('All roles already assigned to user');
      }

      // Create new assignments
      const assignments = await Promise.all(
        newRoleIds.map(roleId =>
          db.userRole.create({
            data: { userId, roleId },
          })
        )
      );

      logger.info({ userId, newRoleIds }, 'Multiple roles assigned to user');

      return assignments.map(assignment => ({
        userId: assignment.userId,
        roleId: assignment.roleId,
        assignedAt: assignment.assignedAt,
      }));
    } catch (error) {
      logger.error({ error, userId, roleIds }, 'Failed to assign multiple roles');
      throw error;
    }
  }

  /**
   * Replace user roles (remove all existing, add new ones)
   */
  async replaceUserRoles(userId: number, roleIds: number[]): Promise<void> {
    try {
      // Use transaction to ensure atomicity
      await db.$transaction(async (prisma) => {
        // Remove all existing roles
        await prisma.userRole.deleteMany({
          where: { userId },
        });

        // Add new roles if provided
        if (roleIds.length > 0) {
          // Check if all roles exist
          const roles = await prisma.role.findMany({
            where: { id: { in: roleIds } },
          });

          if (roles.length !== roleIds.length) {
            throw new ValidationError('One or more roles not found');
          }

          // Create new assignments
          await prisma.userRole.createMany({
            data: roleIds.map(roleId => ({ userId, roleId })),
          });
        }
      });

      logger.info({ userId, newRoleIds: roleIds }, 'User roles replaced');
    } catch (error) {
      logger.error({ error, userId, roleIds }, 'Failed to replace user roles');
      throw error;
    }
  }

  /**
   * Initialize default roles
   */
  async initializeDefaultRoles(): Promise<void> {
    try {
      const defaultRoles = this.getDefaultRoles();

      for (const [key, roleConfig] of Object.entries(defaultRoles)) {
        const existingRole = await db.role.findUnique({
          where: { name: roleConfig.name },
        });

        if (!existingRole) {
          await db.role.create({
            data: {
              name: roleConfig.name,
              description: roleConfig.description,
              permissions: JSON.stringify(roleConfig.permissions),
            },
          });

          logger.info({ roleName: roleConfig.name }, 'Default role created');
        } else {
          // Update permissions if they've changed
          const currentPermissions = JSON.parse(existingRole.permissions);
          const newPermissions = roleConfig.permissions;

          if (JSON.stringify(currentPermissions.sort()) !== JSON.stringify(newPermissions.sort())) {
            await db.role.update({
              where: { id: existingRole.id },
              data: {
                permissions: JSON.stringify(newPermissions),
              },
            });

            logger.info({ roleName: roleConfig.name }, 'Default role permissions updated');
          }
        }
      }

      logger.info('Default roles initialized');
    } catch (error) {
      logger.error({ error }, 'Failed to initialize default roles');
      throw error;
    }
  }
}

export const permissionService = new PermissionService();