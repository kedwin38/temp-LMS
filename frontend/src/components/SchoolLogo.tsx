import React from 'react';

interface SchoolLogoProps {
  size?: number;
  className?: string;
}

export const SchoolLogo: React.FC<SchoolLogoProps> = ({ size = 48, className = '' }) => {
  return (
    <img
      src="/logo.png"
      alt="Shire Jama Learning Center Logo"
      width={size}
      height={size}
      className={`object-contain rounded-full shadow-sm ${className}`}
      onError={(e) => {
        // Fallback placeholder if image is missing or loading fails
        e.currentTarget.src = 'https://ui-avatars.com/api/?name=Shire+Jama&background=0F3A2E&color=C8A051&bold=true';
      }}
    />
  );
};