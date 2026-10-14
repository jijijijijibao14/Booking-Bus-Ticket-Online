import {
  useEffect,
  useState,
} from 'react';
import {
  useForm,
} from 'react-hook-form';
import {
  zodResolver,
} from '@hookform/resolvers/zod';
import * as z from 'zod';
import {
  updateUserInfo,
} from '@/api';
import {
  toast,
} from 'sonner';

const profileSchema = z.object({
  name: z
    .string()
    .min(
      3,
      'Họ tên phải có ít nhất 3 ký tự.',
    ),
  email: z
    .string()
    .email(
      'Email không hợp lệ.',
    ),
  phone: z
    .string()
    .regex(
      /^(84|0[35789])([0-9]{8})$/,
      'Số điện thoại không hợp lệ.',
    ),
});

type ProfileFormValues =
  z.infer<typeof profileSchema>;

interface UserInfo {
  name: string;
  email: string;
  phone: string;
}

export default function PersonalInfo({
  user,
}: {
  user: UserInfo;
}) {
  const [
    isEditing,
    setIsEditing,
  ] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: {
      errors,
      isSubmitting,
    },
  } = useForm<ProfileFormValues>({
    resolver:
      zodResolver(profileSchema),
    defaultValues: user,
  });

  /*
   * user được tải async từ API.
   * react-hook-form không tự cập nhật defaultValues,
   * nên phải reset khi profile mới về.
   */
  useEffect(() => {
    reset(user);
  }, [user, reset]);

  const handleSave = async (
    data: ProfileFormValues,
  ) => {
    try {
      const response =
        await updateUserInfo(data);

      if (response.data.success) {
        toast.success(
          'Cập nhật thông tin thành công!',
        );

        localStorage.setItem(
          'userName',
          data.name,
        );

        localStorage.setItem(
          'userPhone',
          data.phone,
        );

        setIsEditing(false);

        /*
         * API profile sẽ được gọi lại khi reload/tab change.
         * reset ngay để form hiển thị dữ liệu vừa lưu.
         */
        reset(data);
      }
    } catch (error: any) {
      toast.error(
        'Cập nhật thất bại',
        {
          description:
            error.response?.data?.message ||
            'Vui lòng thử lại.',
        },
      );
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-border">
      <div className="flex items-center justify-between px-8 py-6 border-b border-border">
        <div>
          <h2 className="text-2xl font-bold text-foreground">
            Thông tin cá nhân
          </h2>

          <p className="text-muted-foreground mt-1">
            Quản lý thông tin để bảo mật tài khoản.
          </p>
        </div>

        {!isEditing && (
          <button
            type="button"
            onClick={() =>
              setIsEditing(true)
            }
            className="px-4 py-2 text-sm font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90"
          >
            Chỉnh sửa
          </button>
        )}
      </div>

      <form
        onSubmit={
          handleSubmit(handleSave)
        }
        className="p-8 space-y-6"
      >
        <div>
          <label className="block text-sm font-medium text-muted-foreground mb-2">
            Họ và tên
          </label>

          <input
            {...register('name')}
            disabled={!isEditing}
            className={`w-full px-3 py-3 border rounded-lg bg-input-background disabled:bg-muted/50 ${
              errors.name
                ? 'border-red-500'
                : 'border-border'
            }`}
          />

          {errors.name && (
            <p className="text-sm text-red-500 mt-1">
              {errors.name.message}
            </p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-muted-foreground mb-2">
            Email
          </label>

          <input
            {...register('email')}
            disabled
            className="w-full px-3 py-3 border border-border rounded-lg bg-muted/50 cursor-not-allowed"
          />

          {errors.email && (
            <p className="text-sm text-red-500 mt-1">
              {errors.email.message}
            </p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-muted-foreground mb-2">
            Số điện thoại
          </label>

          <input
            type="tel"
            {...register('phone')}
            disabled={!isEditing}
            className={`w-full px-3 py-3 border rounded-lg bg-input-background disabled:bg-muted/50 ${
              errors.phone
                ? 'border-red-500'
                : 'border-border'
            }`}
          />

          {errors.phone && (
            <p className="text-sm text-red-500 mt-1">
              {errors.phone.message}
            </p>
          )}
        </div>

        {isEditing && (
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => {
                setIsEditing(false);
                reset(user);
              }}
              className="px-6 py-2 text-sm font-medium rounded-lg bg-muted text-muted-foreground hover:bg-border"
            >
              Hủy
            </button>

            <button
              type="submit"
              disabled={isSubmitting}
              className="px-6 py-2 text-sm font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
            >
              {isSubmitting
                ? 'Đang lưu...'
                : 'Lưu thay đổi'}
            </button>
          </div>
        )}
      </form>
    </div>
  );
}