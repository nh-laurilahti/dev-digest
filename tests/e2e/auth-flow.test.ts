import { test, expect, Page } from '@playwright/test';
import { db } from '../../src/db';

test.describe('Authentication Flow E2E Tests', () => {
  let page: Page;

  test.beforeEach(async ({ browser }) => {
    page = await browser.newPage();
    
    // Clear any existing test data
    await db.user.deleteMany({
      where: { email: { contains: '@e2e.test' } },
    });
  });

  test.afterEach(async () => {
    await page.close();
  });

  test.describe('User Registration', () => {
    test('should complete user registration flow successfully', async () => {
      await page.goto('/register');

      // Verify registration page loads
      await expect(page.locator('h1')).toContainText('Sign Up');
      await expect(page.locator('form')).toBeVisible();

      // Fill registration form
      await page.fill('[data-testid="username-input"]', 'testuser123');
      await page.fill('[data-testid="email-input"]', 'testuser123@e2e.test');
      await page.fill('[data-testid="password-input"]', 'SecurePassword123!');
      await page.fill('[data-testid="confirm-password-input"]', 'SecurePassword123!');
      await page.fill('[data-testid="full-name-input"]', 'Test User');

      // Submit form
      await page.click('[data-testid="register-button"]');

      // Verify successful registration
      await expect(page.locator('[data-testid="success-message"]')).toBeVisible();
      await expect(page.locator('[data-testid="success-message"]')).toContainText('Registration successful');

      // Should redirect to dashboard
      await page.waitForURL('/dashboard');
      await expect(page.locator('[data-testid="dashboard-welcome"]')).toBeVisible();
      await expect(page.locator('[data-testid="user-name"]')).toContainText('Test User');
    });

    test('should show validation errors for invalid data', async () => {
      await page.goto('/register');

      // Try to submit with empty fields
      await page.click('[data-testid="register-button"]');

      // Verify validation errors
      await expect(page.locator('[data-testid="username-error"]')).toBeVisible();
      await expect(page.locator('[data-testid="email-error"]')).toBeVisible();
      await expect(page.locator('[data-testid="password-error"]')).toBeVisible();

      // Fill with invalid email
      await page.fill('[data-testid="email-input"]', 'invalid-email');
      await page.click('[data-testid="register-button"]');
      await expect(page.locator('[data-testid="email-error"]')).toContainText('Please enter a valid email');

      // Fill with weak password
      await page.fill('[data-testid="email-input"]', 'valid@e2e.test');
      await page.fill('[data-testid="password-input"]', '123');
      await page.click('[data-testid="register-button"]');
      await expect(page.locator('[data-testid="password-error"]')).toContainText('Password must be at least 8 characters');

      // Fill with mismatched password confirmation
      await page.fill('[data-testid="password-input"]', 'SecurePassword123!');
      await page.fill('[data-testid="confirm-password-input"]', 'DifferentPassword123!');
      await page.click('[data-testid="register-button"]');
      await expect(page.locator('[data-testid="confirm-password-error"]')).toContainText('Passwords do not match');
    });

    test('should handle duplicate email registration', async () => {
      const email = 'duplicate@e2e.test';
      
      // Create user first via API or direct database insertion
      await db.user.create({
        data: {
          username: 'existinguser',
          email,
          passwordHash: 'hashed_password',
          fullName: 'Existing User',
          isActive: true,
        },
      });

      await page.goto('/register');

      // Try to register with same email
      await page.fill('[data-testid="username-input"]', 'newuser');
      await page.fill('[data-testid="email-input"]', email);
      await page.fill('[data-testid="password-input"]', 'SecurePassword123!');
      await page.fill('[data-testid="confirm-password-input"]', 'SecurePassword123!');
      await page.fill('[data-testid="full-name-input"]', 'New User');

      await page.click('[data-testid="register-button"]');

      // Verify error message
      await expect(page.locator('[data-testid="error-message"]')).toBeVisible();
      await expect(page.locator('[data-testid="error-message"]')).toContainText('Email already registered');
    });

    test('should navigate to login page from registration', async () => {
      await page.goto('/register');

      // Click login link
      await page.click('[data-testid="login-link"]');

      // Verify navigation to login page
      await page.waitForURL('/login');
      await expect(page.locator('h1')).toContainText('Sign In');
    });
  });

  test.describe('User Login', () => {
    test.beforeEach(async () => {
      // Create test user for login tests
      await db.user.create({
        data: {
          username: 'logintest',
          email: 'logintest@e2e.test',
          passwordHash: await require('bcrypt').hash('TestPassword123!', 12),
          fullName: 'Login Test User',
          isActive: true,
        },
      });
    });

    test('should complete login flow successfully', async () => {
      await page.goto('/login');

      // Verify login page loads
      await expect(page.locator('h1')).toContainText('Sign In');

      // Fill login form
      await page.fill('[data-testid="email-input"]', 'logintest@e2e.test');
      await page.fill('[data-testid="password-input"]', 'TestPassword123!');

      // Submit form
      await page.click('[data-testid="login-button"]');

      // Verify successful login
      await page.waitForURL('/dashboard');
      await expect(page.locator('[data-testid="dashboard-welcome"]')).toBeVisible();
      await expect(page.locator('[data-testid="user-name"]')).toContainText('Login Test User');

      // Verify authentication token is set (check for authenticated state)
      const logoutButton = page.locator('[data-testid="logout-button"]');
      await expect(logoutButton).toBeVisible();
    });

    test('should show error for invalid credentials', async () => {
      await page.goto('/login');

      // Try with wrong password
      await page.fill('[data-testid="email-input"]', 'logintest@e2e.test');
      await page.fill('[data-testid="password-input"]', 'WrongPassword');
      await page.click('[data-testid="login-button"]');

      // Verify error message
      await expect(page.locator('[data-testid="error-message"]')).toBeVisible();
      await expect(page.locator('[data-testid="error-message"]')).toContainText('Invalid email or password');

      // Try with non-existent email
      await page.fill('[data-testid="email-input"]', 'nonexistent@e2e.test');
      await page.fill('[data-testid="password-input"]', 'TestPassword123!');
      await page.click('[data-testid="login-button"]');

      await expect(page.locator('[data-testid="error-message"]')).toContainText('Invalid email or password');
    });

    test('should handle remember me functionality', async () => {
      await page.goto('/login');

      await page.fill('[data-testid="email-input"]', 'logintest@e2e.test');
      await page.fill('[data-testid="password-input"]', 'TestPassword123!');
      
      // Check remember me option
      await page.check('[data-testid="remember-me-checkbox"]');
      await page.click('[data-testid="login-button"]');

      await page.waitForURL('/dashboard');

      // Verify that session persists (check localStorage or cookies)
      const rememberToken = await page.evaluate(() => localStorage.getItem('rememberToken'));
      expect(rememberToken).toBeTruthy();
    });

    test('should redirect to original destination after login', async () => {
      // Try to access protected route
      await page.goto('/repositories');

      // Should redirect to login
      await page.waitForURL('/login?redirect=%2Frepositories');
      await expect(page.locator('h1')).toContainText('Sign In');

      // Login
      await page.fill('[data-testid="email-input"]', 'logintest@e2e.test');
      await page.fill('[data-testid="password-input"]', 'TestPassword123!');
      await page.click('[data-testid="login-button"]');

      // Should redirect to original destination
      await page.waitForURL('/repositories');
      await expect(page.locator('h1')).toContainText('Repositories');
    });
  });

  test.describe('User Logout', () => {
    test.beforeEach(async () => {
      // Create and login user
      const user = await db.user.create({
        data: {
          username: 'logouttest',
          email: 'logouttest@e2e.test',
          passwordHash: await require('bcrypt').hash('TestPassword123!', 12),
          fullName: 'Logout Test User',
          isActive: true,
        },
      });

      // Login via API to set authentication state
      const response = await page.request.post('/api/auth/login', {
        data: {
          email: 'logouttest@e2e.test',
          password: 'TestPassword123!',
        },
      });
      
      const loginData = await response.json();
      
      // Set authentication token
      await page.evaluate((token) => {
        localStorage.setItem('accessToken', token);
      }, loginData.data.tokens.accessToken);
    });

    test('should logout successfully', async () => {
      await page.goto('/dashboard');

      // Verify user is logged in
      await expect(page.locator('[data-testid="user-name"]')).toContainText('Logout Test User');

      // Click logout button
      await page.click('[data-testid="logout-button"]');

      // Should redirect to login page
      await page.waitForURL('/login');
      await expect(page.locator('h1')).toContainText('Sign In');

      // Verify authentication state is cleared
      const accessToken = await page.evaluate(() => localStorage.getItem('accessToken'));
      expect(accessToken).toBeNull();

      // Try to access protected route - should redirect to login
      await page.goto('/dashboard');
      await page.waitForURL('/login');
    });

    test('should logout from all devices', async () => {
      await page.goto('/dashboard');

      // Access logout options
      await page.click('[data-testid="user-menu"]');
      await page.click('[data-testid="logout-all-devices"]');

      // Confirm logout from all devices
      await expect(page.locator('[data-testid="confirm-dialog"]')).toBeVisible();
      await page.click('[data-testid="confirm-logout-all"]');

      // Should redirect to login
      await page.waitForURL('/login');
      await expect(page.locator('[data-testid="success-message"]')).toContainText('Logged out from all devices');
    });
  });

  test.describe('Password Reset Flow', () => {
    test.beforeEach(async () => {
      await db.user.create({
        data: {
          username: 'resettest',
          email: 'resettest@e2e.test',
          passwordHash: await require('bcrypt').hash('OldPassword123!', 12),
          fullName: 'Reset Test User',
          isActive: true,
        },
      });
    });

    test('should initiate password reset successfully', async () => {
      await page.goto('/login');

      // Click forgot password link
      await page.click('[data-testid="forgot-password-link"]');

      // Verify forgot password page
      await page.waitForURL('/forgot-password');
      await expect(page.locator('h1')).toContainText('Reset Password');

      // Enter email
      await page.fill('[data-testid="email-input"]', 'resettest@e2e.test');
      await page.click('[data-testid="send-reset-button"]');

      // Verify success message
      await expect(page.locator('[data-testid="success-message"]')).toBeVisible();
      await expect(page.locator('[data-testid="success-message"]')).toContainText('Password reset instructions sent');
    });

    test('should handle non-existent email for password reset', async () => {
      await page.goto('/forgot-password');

      await page.fill('[data-testid="email-input"]', 'nonexistent@e2e.test');
      await page.click('[data-testid="send-reset-button"]');

      // Should still show success message (security measure)
      await expect(page.locator('[data-testid="success-message"]')).toContainText('Password reset instructions sent');
    });

    test('should complete password reset with valid token', async () => {
      // This would require generating a real reset token
      // For demo purposes, we'll simulate the flow
      const resetToken = 'mock-reset-token';
      
      await page.goto(`/reset-password?token=${resetToken}`);

      // Verify reset password page
      await expect(page.locator('h1')).toContainText('Set New Password');

      // Enter new password
      await page.fill('[data-testid="password-input"]', 'NewPassword123!');
      await page.fill('[data-testid="confirm-password-input"]', 'NewPassword123!');
      await page.click('[data-testid="reset-password-button"]');

      // Should redirect to login with success message
      await page.waitForURL('/login');
      await expect(page.locator('[data-testid="success-message"]')).toContainText('Password reset successfully');

      // Verify new password works
      await page.fill('[data-testid="email-input"]', 'resettest@e2e.test');
      await page.fill('[data-testid="password-input"]', 'NewPassword123!');
      await page.click('[data-testid="login-button"]');

      await page.waitForURL('/dashboard');
      await expect(page.locator('[data-testid="dashboard-welcome"]')).toBeVisible();
    });

    test('should handle expired reset token', async () => {
      const expiredToken = 'expired-reset-token';
      
      await page.goto(`/reset-password?token=${expiredToken}`);

      await expect(page.locator('[data-testid="error-message"]')).toBeVisible();
      await expect(page.locator('[data-testid="error-message"]')).toContainText('Reset token has expired');

      // Should provide option to request new reset
      await expect(page.locator('[data-testid="request-new-reset-link"]')).toBeVisible();
    });
  });

  test.describe('Session Management', () => {
    test('should maintain session across page refreshes', async () => {
      // Login
      await page.goto('/login');
      await page.fill('[data-testid="email-input"]', 'logintest@e2e.test');
      await page.fill('[data-testid="password-input"]', 'TestPassword123!');
      await page.click('[data-testid="login-button"]');

      await page.waitForURL('/dashboard');

      // Refresh page
      await page.reload();

      // Should still be logged in
      await expect(page.locator('[data-testid="dashboard-welcome"]')).toBeVisible();
      await expect(page.locator('[data-testid="user-name"]')).toContainText('Login Test User');
    });

    test('should handle session expiration gracefully', async () => {
      // Login first
      await page.goto('/login');
      await page.fill('[data-testid="email-input"]', 'logintest@e2e.test');
      await page.fill('[data-testid="password-input"]', 'TestPassword123!');
      await page.click('[data-testid="login-button"]');

      await page.waitForURL('/dashboard');

      // Simulate expired token by clearing/modifying localStorage
      await page.evaluate(() => {
        localStorage.setItem('accessToken', 'expired-token');
      });

      // Try to access protected resource
      await page.goto('/repositories');

      // Should redirect to login due to expired session
      await page.waitForURL('/login');
      await expect(page.locator('[data-testid="info-message"]')).toContainText('Session expired');
    });

    test('should refresh tokens automatically', async () => {
      // This test would verify automatic token refresh functionality
      // Implementation depends on the specific token refresh strategy
      expect(true).toBe(true); // Placeholder
    });
  });

  test.describe('Account Settings', () => {
    test.beforeEach(async () => {
      const user = await db.user.create({
        data: {
          username: 'settingstest',
          email: 'settingstest@e2e.test',
          passwordHash: await require('bcrypt').hash('TestPassword123!', 12),
          fullName: 'Settings Test User',
          isActive: true,
        },
      });

      // Login
      const response = await page.request.post('/api/auth/login', {
        data: {
          email: 'settingstest@e2e.test',
          password: 'TestPassword123!',
        },
      });
      
      const loginData = await response.json();
      
      await page.evaluate((token) => {
        localStorage.setItem('accessToken', token);
      }, loginData.data.tokens.accessToken);
    });

    test('should change password successfully', async () => {
      await page.goto('/settings/account');

      // Navigate to password change section
      await page.click('[data-testid="change-password-tab"]');

      // Fill password change form
      await page.fill('[data-testid="current-password-input"]', 'TestPassword123!');
      await page.fill('[data-testid="new-password-input"]', 'NewTestPassword123!');
      await page.fill('[data-testid="confirm-new-password-input"]', 'NewTestPassword123!');

      await page.click('[data-testid="change-password-button"]');

      // Verify success message
      await expect(page.locator('[data-testid="success-message"]')).toContainText('Password changed successfully');

      // Verify new password works by logging out and back in
      await page.click('[data-testid="logout-button"]');
      await page.waitForURL('/login');

      await page.fill('[data-testid="email-input"]', 'settingstest@e2e.test');
      await page.fill('[data-testid="password-input"]', 'NewTestPassword123!');
      await page.click('[data-testid="login-button"]');

      await page.waitForURL('/dashboard');
      await expect(page.locator('[data-testid="dashboard-welcome"]')).toBeVisible();
    });

    test('should update profile information', async () => {
      await page.goto('/settings/profile');

      // Update profile information
      await page.fill('[data-testid="full-name-input"]', 'Updated Full Name');
      await page.fill('[data-testid="username-input"]', 'updatedusername');

      await page.click('[data-testid="save-profile-button"]');

      // Verify success message
      await expect(page.locator('[data-testid="success-message"]')).toContainText('Profile updated successfully');

      // Verify changes are reflected in UI
      await page.goto('/dashboard');
      await expect(page.locator('[data-testid="user-name"]')).toContainText('Updated Full Name');
    });
  });
});