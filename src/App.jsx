import { useState } from 'react';
import logo from './assets/logo.png';
import { FaWandMagicSparkles } from "react-icons/fa6";

const App = () => {
  const [isRotating, setIsRotating] = useState(false);

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-black via-gray-900/95 to-black text-white/90 items-center justify-center p-6">
      <div className="flex flex-col items-center space-y-6 max-w-md">
        {/* Logo with subtle glow */}
        <div className="relative">
          <div className="absolute inset-0 bg-white/5 rounded-full blur-xl"></div>
          <img 
            className={`size-32 relative transition-all duration-500 hover:scale-105 ${isRotating ? 'animate-pulse' : ''}`} 
            src={logo} 
            alt="Logo" 
          />
        </div>
        
        {/* Divider */}
        <div className="w-12 h-px bg-white/10"></div>
        
        {/* Main text */}
        <p className="text-xl md:text-2xl font-light tracking-wide text-white/80">
          Hello Vite + React + TailwindCSS!
        </p>

        <button 
          onClick={() => setIsRotating(!isRotating)}
          className="flex items-center gap-2 mt-2 px-6 py-2.5 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 text-white/80 text-sm tracking-wider transition-all duration-300 hover:shadow-[0_0_20px_rgba(255,255,255,0.1)] active:scale-95"
        >
          {isRotating ? 'Stop Magic' : 'Do Magic'} <FaWandMagicSparkles className='text-yellow-500'/>
        </button>
        
        {/* Version/Footer text */}
        <p className="text-xs text-white/20 font-mono mt-8">
          v1.0.0 — ready to build
        </p>
      </div>
    </div>
  );
};

export default App;