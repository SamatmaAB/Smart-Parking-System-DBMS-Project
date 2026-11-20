import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Parkwise — Smart Parking Management System | PES University DBMS',
  description: 'Department of Computer Science and Engineering - Level 3 MiniProject: Smart Parking Relational, NoSQL & Vector DBMS',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
