-- Robust Admin Bootstrap for: mayanksuri2112@gmail.com
-- Handles both newer Supabase auth schema (provider_id required in identities)
-- and existing users.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
DECLARE
  target_email TEXT := 'mayanksuri2112@gmail.com';
  target_password TEXT := 'mayankxsuri21';
  target_user_id UUID;
  encrypted_pw TEXT;
BEGIN
  encrypted_pw := crypt(target_password, gen_salt('bf'));

  SELECT id INTO target_user_id
  FROM auth.users
  WHERE email = target_email;

  IF target_user_id IS NULL THEN
    target_user_id := gen_random_uuid();

    -- Insert into auth.users with pre-confirmed email
    INSERT INTO auth.users (
      instance_id,
      id,
      aud,
      role,
      email,
      encrypted_password,
      email_confirmed_at,
      raw_app_meta_data,
      raw_user_meta_data,
      created_at,
      updated_at,
      confirmation_token,
      email_change,
      email_change_token_new,
      recovery_token
    ) VALUES (
      '00000000-0000-0000-0000-000000000000',
      target_user_id,
      'authenticated',
      'authenticated',
      target_email,
      encrypted_pw,
      now(),
      '{"provider":"email","providers":["email"]}',
      '{"full_name":"Mayank Suri"}',
      now(),
      now(),
      '',
      '',
      '',
      ''
    );

    -- Insert into auth.identities with provider_id explicitly set
    INSERT INTO auth.identities (
      id,
      provider_id,
      user_id,
      identity_data,
      provider,
      last_sign_in_at,
      created_at,
      updated_at
    ) VALUES (
      gen_random_uuid(),
      target_user_id::text,
      target_user_id,
      json_build_object('sub', target_user_id::text, 'email', target_email),
      'email',
      now(),
      now(),
      now()
    );

    RAISE NOTICE 'Created new user % with confirmed email.', target_email;
  ELSE
    -- If user already exists, update password and confirm email
    UPDATE auth.users
    SET encrypted_password = encrypted_pw,
        email_confirmed_at = COALESCE(email_confirmed_at, now()),
        updated_at = now()
    WHERE id = target_user_id;

    -- Ensure identity exists with provider_id
    INSERT INTO auth.identities (
      id,
      provider_id,
      user_id,
      identity_data,
      provider,
      last_sign_in_at,
      created_at,
      updated_at
    ) VALUES (
      gen_random_uuid(),
      target_user_id::text,
      target_user_id,
      json_build_object('sub', target_user_id::text, 'email', target_email),
      'email',
      now(),
      now(),
      now()
    )
    ON CONFLICT (provider, provider_id) DO NOTHING;

    RAISE NOTICE 'Updated existing user % with new password and confirmed email.', target_email;
  END IF;

  -- Ensure profile exists with role 'admin'
  INSERT INTO public.profiles (id, full_name, email, role, is_active)
  VALUES (
    target_user_id,
    'Mayank Suri',
    target_email,
    'admin',
    true
  )
  ON CONFLICT (id) DO UPDATE
  SET role = 'admin',
      is_active = true,
      updated_at = now();

  -- Add to public.administrators table
  INSERT INTO public.administrators (user_id)
  VALUES (target_user_id)
  ON CONFLICT (user_id) DO NOTHING;

  RAISE NOTICE 'SUCCESS: % is now confirmed and authorized as ADMIN.', target_email;
END $$;
