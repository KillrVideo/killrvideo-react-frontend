
import { Button } from '@/components/ui/button';
import SearchBar from '@/components/search/SearchBar';

const HeroSection = () => {
  return (
    <section className="relative bg-gradient-to-br from-primary via-purple-800 to-purple-900 text-white overflow-hidden">
      {/* Animated background triangles */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute top-20 left-20 w-0 h-0 border-l-[30px] border-l-transparent border-r-[30px] border-r-transparent border-b-[40px] border-b-white/10 animate-triangle-float"></div>
        <div className="absolute top-40 right-32 w-0 h-0 border-l-[20px] border-l-transparent border-r-[20px] border-r-transparent border-b-[25px] border-b-accent/20 animate-triangle-float" style={{ animationDelay: '2s' }}></div>
        <div className="absolute bottom-32 left-1/4 w-0 h-0 border-l-[25px] border-l-transparent border-r-[25px] border-r-transparent border-b-[35px] border-b-white/5 animate-triangle-float" style={{ animationDelay: '4s' }}></div>
      </div>

      <div className="relative container mx-auto px-4 sm:px-6 lg:px-8 py-24 lg:py-32">
        <div className="max-w-4xl mx-auto text-center">
          <h1 className="font-sora text-4xl md:text-6xl font-bold mb-6 animate-fade-in">
            The Future of
            <span className="text-accent"> Video Streaming</span>
          </h1>
          <p className="font-noto text-xl md:text-2xl text-purple-100 mb-8 animate-fade-in" style={{ animationDelay: '0.2s' }}>
            Discover, share, and explore videos on a platform built for developers and creators.
            Experience scalable architecture in action.
          </p>

          <div className="max-w-2xl mx-auto mb-8 animate-fade-in" style={{ animationDelay: '0.4s' }}>
            <SearchBar className="flex-col sm:flex-row" />
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 animate-fade-in" style={{ animationDelay: '0.6s' }}>
            <Button 
              size="lg" 
              variant="outline" 
              className="bg-white/10 border-white/20 text-white hover:bg-white/20 font-noto"
            >
              Explore Videos
            </Button>
            <Button 
              size="lg" 
              variant="ghost" 
              className="text-white hover:bg-white/10 font-noto"
            >
              Developer Docs
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
};

export default HeroSection;
