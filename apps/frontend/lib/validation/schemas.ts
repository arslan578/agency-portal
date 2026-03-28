import { z } from 'zod';

export const campaignSchema = z.object({
  campaignName: z.string().min(3, 'Campaign name must be at least 3 characters').max(100, 'Campaign name must be less than 100 characters'),
  objective: z.enum(['awareness', 'traffic', 'conversion', 'engagement', 'leads', 'sales'], {
    message: 'Please select a valid objective'
  }),
  budget: z.string().refine((val) => {
    const num = parseFloat(val);
    return !isNaN(num) && num > 0;
  }, 'Budget must be a positive number'),
  selectedPlatforms: z.array(z.string()).min(1, 'Please select at least one platform'),
});

export const loginSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

export const signupSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters').regex(/[A-Z]/, 'Password must contain at least one uppercase letter').regex(/[a-z]/, 'Password must contain at least one lowercase letter').regex(/[0-9]/, 'Password must contain at least one number'),
  confirmPassword: z.string(),
  fullName: z.string().min(2, 'Full name must be at least 2 characters'),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ['confirmPassword'],
});
