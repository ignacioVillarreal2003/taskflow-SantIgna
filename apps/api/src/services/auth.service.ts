import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { PrismaClient } from '@prisma/client'
import { z } from 'zod'

const JWT_SECRET = process.env.JWT_SECRET ?? 'dev-secret-change-in-production'
const JWT_EXPIRES_IN = '24h'
const MAX_FAILED_ATTEMPTS = 5
const LOCK_DURATION_MINUTES = 15

export const RegisterSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number'),
  name: z.string().optional(),
})

export const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})

export type RegisterInput = z.infer<typeof RegisterSchema>
export type LoginInput = z.infer<typeof LoginSchema>

export class AuthService {
  constructor(private db: PrismaClient) {}

  async register(input: RegisterInput) {
    const parsed = RegisterSchema.parse(input)

    const existing = await this.db.user.findUnique({
      where: { email: parsed.email },
    })
    if (existing) {
      throw new ConflictError('Email already registered')
    }

    const passwordHash = await bcrypt.hash(parsed.password, 12)

    const user = await this.db.user.create({
      data: {
        email: parsed.email,
        passwordHash,
        name: parsed.name,
      },
      select: { id: true, email: true, name: true, createdAt: true },
    })

    const token = this.generateToken(user.id)
    return { user, token }
  }

  async login(input: LoginInput) {
    const parsed = LoginSchema.parse(input)

    const user = await this.db.user.findUnique({
      where: { email: parsed.email },
    })

    if (!user) {
      throw new UnauthorizedError('Invalid credentials')
    }

    // Check account lock
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      const minutesLeft = Math.ceil(
        (user.lockedUntil.getTime() - Date.now()) / 60000
      )
      throw new UnauthorizedError(
        `Account locked. Try again in ${minutesLeft} minutes`
      )
    }

    const isValid = await bcrypt.compare(parsed.password, user.passwordHash)

    if (!isValid) {
      await this.handleFailedLogin(user.id)
      throw new UnauthorizedError('Invalid credentials')
    }

    // Reset on successful login
    await this.db.user.update({
      where: { id: user.id },
      data: { failedLogins: 0, lockedUntil: null },
    })

    const token = this.generateToken(user.id)

    return {
      user: { id: user.id, email: user.email, name: user.name },
      token,
    }
  }

  async handleFailedLogin(userId: string): Promise<void> {
    const user = await this.db.user.findUnique({ where: { id: userId } })
    if (!user) return

    if (user.lockedUntil && user.lockedUntil > new Date()) {
      return
    }

    const newFailedCount = user.failedLogins + 1
    const shouldLock = newFailedCount >= MAX_FAILED_ATTEMPTS

    await this.db.user.update({
      where: { id: user.id },
      data: {
        failedLogins: newFailedCount,
        lockedUntil: shouldLock
          ? new Date(Date.now() + LOCK_DURATION_MINUTES * 60 * 1000)
          : null,
      },
    })
  }

  verifyToken(token: string): { userId: string } {
    return jwt.verify(token, JWT_SECRET) as { userId: string }
  }

  private generateToken(userId: string): string {
    return jwt.sign({ userId }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN })
  }
}

// ── Custom errors ───────────────────────────────────────────────
export class ConflictError extends Error {
  readonly statusCode = 409
  constructor(message: string) {
    super(message)
    this.name = 'ConflictError'
  }
}

export class UnauthorizedError extends Error {
  readonly statusCode = 401
  constructor(message: string) {
    super(message)
    this.name = 'UnauthorizedError'
  }
}

export class ValidationError extends Error {
  readonly statusCode = 400
  constructor(message: string) {
    super(message)
    this.name = 'ValidationError'
  }
}

export class NotFoundError extends Error {
  readonly statusCode = 404
  constructor(message: string) {
    super(message)
    this.name = 'NotFoundError'
  }
}

export class ForbiddenError extends Error {
  readonly statusCode = 403
  constructor(message: string) {
    super(message)
    this.name = 'ForbiddenError'
  }
}

export class UnprocessableError extends Error {
  readonly statusCode = 422
  constructor(message: string) {
    super(message)
    this.name = 'UnprocessableError'
  }
}
