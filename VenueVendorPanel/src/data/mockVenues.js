/** Sample data until venue-vendor venue APIs are connected */

export const MOCK_VENUES = [
  {
    id: "1",
    name: "Grand Ballroom",
    category: "Wedding Hall",
    location: "Mumbai, Maharashtra",
    capacity: 500,
    sizeSqFt: 5000,
    pricePerDay: 50000,
    status: "available",
    totalBookings: 45,
    enabled: true,
    image: "https://images.unsplash.com/photo-1519167758481-83f550bb49b8?w=400&h=280&fit=crop",
  },
  {
    id: "2",
    name: "Garden Venue",
    category: "Outdoor Event",
    location: "Delhi, NCR",
    capacity: 300,
    sizeSqFt: 8000,
    pricePerDay: 35000,
    status: "booked",
    totalBookings: 32,
    enabled: true,
    image: "https://images.unsplash.com/photo-1464366400600-7168b465afe3?w=400&h=280&fit=crop",
  },
  {
    id: "3",
    name: "Conference Hall",
    category: "Corporate Event",
    location: "Bangalore, Karnataka",
    capacity: 200,
    sizeSqFt: 3000,
    pricePerDay: 25000,
    status: "available",
    totalBookings: 28,
    enabled: true,
    image: "https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=400&h=280&fit=crop",
  },
  {
    id: "4",
    name: "Rooftop Lounge",
    category: "Party Service",
    location: "Pune, Maharashtra",
    capacity: 150,
    sizeSqFt: 2500,
    pricePerDay: 40000,
    status: "available",
    totalBookings: 19,
    enabled: false,
    image: "https://images.unsplash.com/photo-1514933651103-005eec06c04b?w=400&h=280&fit=crop",
  },
];

export function formatVenuePrice(amount) {
  return `₹${Number(amount).toLocaleString("en-IN")}/day`;
}
