import React, { useEffect } from 'react';

interface OAuthSuccessProps {
  onSuccess: (token: string) => void;
}

export default function OAuthSuccess({ onSuccess }: OAuthSuccessProps) {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get("token");

    if (token) {
      // Store token
      localStorage.setItem("token", token);
      document.cookie = `token=${token}; path=/; max-age=86400; SameSite=Lax`;
      
      // Notify parent app of success
      onSuccess(token);
    } else {
      // Handle error case - redirect to login
      window.location.href = "/";
    }
  }, [onSuccess]);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-[#07090e] text-gray-200">
      <div className="w-12 h-12 rounded-full border-2 border-purple-500 border-t-transparent animate-spin mb-4"></div>
      <p className="text-gray-400 font-medium animate-pulse">Syncing OAuth session...</p>
    </div>
  );
}
