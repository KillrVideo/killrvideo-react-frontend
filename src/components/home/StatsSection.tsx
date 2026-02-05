
import { Eye, User, Star, Clock } from 'lucide-react';

const stats = [
  {
    icon: Eye,
    value: '—',
    label: 'Total Views',
    description: 'Coming soon'
  },
  {
    icon: User,
    value: '—',
    label: 'Active Creators',
    description: 'Coming soon'
  },
  {
    icon: Star,
    value: '—',
    label: 'Average Rating',
    description: 'Coming soon'
  },
  {
    icon: Clock,
    value: '—',
    label: 'Hours Streamed',
    description: 'Coming soon'
  }
];

const StatsSection = () => {
  return (
    <section className="py-16 bg-gray-50">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12">
          <h2 className="font-sora text-3xl md:text-4xl font-bold text-gray-900 mb-4">
            Platform Statistics
          </h2>
          <p className="font-noto text-lg text-gray-600 max-w-2xl mx-auto">
            Platform statistics coming soon
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
          {stats.map((stat, index) => (
            <div 
              key={index} 
              className="text-center p-6 bg-white rounded-lg shadow-sm border border-gray-200 hover:shadow-md transition-shadow"
            >
              <div className="w-12 h-12 mx-auto mb-4 bg-primary/10 rounded-lg flex items-center justify-center">
                <stat.icon className="w-6 h-6 text-primary" />
              </div>
              <div className="font-sora text-3xl font-bold text-gray-900 mb-2">
                {stat.value}
              </div>
              <div className="font-noto font-semibold text-gray-700 mb-1">
                {stat.label}
              </div>
              <div className="font-noto text-sm text-gray-500">
                {stat.description}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default StatsSection;
