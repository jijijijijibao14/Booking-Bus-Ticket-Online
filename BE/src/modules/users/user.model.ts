// src/modules/users/user.model.ts

export interface UserModel {
  user_id?: number;
  username: string;
  password_plain: string; // Lưu text thô để chấm bài/demo trực quan
  email: string;
  full_name: string;
  phone: string;
  role: 'Customer' | 'Partner' | 'Admin';
  wallet_balance?: number;
  created_at?: Date;
  updated_at?: Date;
}

export interface PartnerProfileModel {
  partner_id: number; // Vừa là PK vừa là FK sang users
  brand_name: string;
  license_number: string;
  commission_rate?: number;
  withdrawable_balance?: number;
  is_approved?: boolean; // Mặc định FALSE (Chờ duyệt)
  created_at?: Date;
}