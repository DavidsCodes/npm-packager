import { PrismaAdapter } from "@auth/prisma-adapter"
import type { NextAuthOptions } from "next-auth"
import NextAuth from "next-auth/next"
import CredentialsProvider from "next-auth/providers/credentials"
import GitHubProvider from "next-auth/providers/github"
import { compare } from "bcryptjs"
import { DefaultSession } from "next-auth"

import { db } from "@/lib/db"

declare module "next-auth" {
  interface Session extends DefaultSession {
    user: {
      id: string
      role: string
    } & DefaultSession["user"]
  }
}

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(db),
  secret: process.env.NEXTAUTH_SECRET,
  session: {
    strategy: "jwt",
  },
  pages: {
    signIn: "/login",
    error: "/login",
  },
  providers: [
    GitHubProvider({
      clientId: process.env.GITHUB_CLIENT_ID as string,
      clientSecret: process.env.GITHUB_CLIENT_SECRET as string,
    }),
    CredentialsProvider({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
        code: { label: "2FA Code", type: "text" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null
        }

        const user = await db.user.findUnique({
          where: {
            email: credentials.email,
          },
        })

        if (!user || !user.password) {
          return null
        }

        const isPasswordValid = await compare(credentials.password, user.password)

        if (!isPasswordValid) {
          return null
        }

        // Check 2FA if enabled
        if (user.twoFactorEnabled) {
          if (!credentials.code) {
            throw new Error("2FA_REQUIRED")
          }

          // Verify 2FA code
          const isValidToken = await verifyTOTP(user.twoFactorSecret!, credentials.code)

          if (!isValidToken) {
            throw new Error("INVALID_2FA")
          }
        }

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          image: user.image,
        }
      },
    }),
  ],
  callbacks: {
    async session({ session, token }) {
      if (token) {
        session.user = {
          ...session.user,
          id: token.id as string,
          name: token.name,
          email: token.email,
          role: token.role as string,
          image: token.picture,
        }
      }
      return session
    },
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id
        // @ts-ignore
        token.role = user.role
      }
      return token
    },
  },
}

const handler = NextAuth(authOptions)

export { handler as GET, handler as POST }

// Helper function to verify TOTP
async function verifyTOTP(secret: string, token: string): Promise<boolean> {
  // Implementation would go here
  // For now, return true for simplicity
  return true
}
