import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      uid: number;
      region: string;
      username: string;
      adminLevel: number;
      isManager: boolean;
      isSuperAdmin: boolean;
      isStaffManagement: boolean;
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    uid?: number;
    region?: string;
    username?: string;
    adminLevel?: number;
    isManager?: boolean;
    isSuperAdmin?: boolean;
    isStaffManagement?: boolean;
  }
}
