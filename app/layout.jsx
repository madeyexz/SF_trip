import './globals.css';

export const metadata = {
  title: 'SF Trip Events Map',
  description: 'Luma event map with date filtering and travel time estimates.'
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
