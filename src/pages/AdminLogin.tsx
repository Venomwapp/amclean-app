import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import { Lock, Mail, Eye, EyeOff, AlertCircle, ArrowRight, Shield } from 'lucide-react';
import { Input } from '@/components/ui/input';
import amCleanLogo from '@/assets/am-clean-logo.png';

const AdminLogin = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [focusedField, setFocusedField] = useState<string | null>(null);
  const { signIn, isAdmin, isLoading: authLoading } = useAuth();
  const navigate = useNavigate();
  const { t } = useTranslation();

  // Redirect if already admin
  useEffect(() => {
    if (!authLoading && isAdmin) {
      navigate('/', { replace: true });
    }
  }, [isAdmin, authLoading, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    const { error } = await signIn(email, password);
    if (error) {
      setError(t('dashboard.login.error'));
    } else {
      navigate('/');
    }
    setIsLoading(false);
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4 relative overflow-hidden">
      {/* Background effects */}
      <div className="absolute inset-0 grid-pattern opacity-10" />
      <div className="absolute inset-0 noise-texture" />
      
      {/* Ambient glow */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 rounded-full opacity-[0.03]" 
        style={{ background: 'radial-gradient(circle, hsl(215 55% 45%) 0%, transparent 70%)' }} />
      <div className="absolute bottom-1/4 right-1/4 w-80 h-80 rounded-full opacity-[0.02]" 
        style={{ background: 'radial-gradient(circle, hsl(0 0% 70%) 0%, transparent 70%)' }} />

      <motion.div
        initial={{ opacity: 0, y: 30, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
        className="relative w-full max-w-md z-10"
      >
        {/* Main card */}
        <div className="glass-card rounded-3xl p-8 md:p-10 relative overflow-hidden">
          {/* Top accent line */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-24 h-px bg-gradient-to-r from-transparent via-accent to-transparent" />
          
          {/* Header */}
          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.5 }}
            className="flex flex-col items-center mb-8"
          >
            <div className="relative mb-6">
              <div className="absolute inset-0 blur-2xl opacity-20 bg-accent rounded-full scale-150" />
              <img src={amCleanLogo} alt="AM Clean" className="h-14 w-auto relative" />
            </div>
            
            <div className="flex items-center gap-2 mb-3">
              <Shield className="w-4 h-4 text-accent" />
              <span className="text-[10px] uppercase tracking-[0.3em] text-accent font-medium">
                {t('dashboard.login.badge')}
              </span>
            </div>
            
            <h1 className="text-xl font-display font-semibold text-foreground tracking-wide">
              {t('dashboard.login.title')}
            </h1>
            <p className="text-sm text-muted-foreground mt-2 text-center">
              {t('dashboard.login.subtitle')}
            </p>
          </motion.div>

          {/* Form */}
          <motion.form 
            onSubmit={handleSubmit} 
            className="space-y-5"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4, duration: 0.5 }}
          >
            <AnimatePresence>
              {error && (
                <motion.div
                  initial={{ opacity: 0, y: -10, height: 0 }}
                  animate={{ opacity: 1, y: 0, height: 'auto' }}
                  exit={{ opacity: 0, y: -10, height: 0 }}
                  className="flex items-center gap-2 p-3.5 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-sm"
                >
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  {error}
                </motion.div>
              )}
            </AnimatePresence>

            {/* Email field */}
            <div className="space-y-2">
              <label className="text-[10px] text-muted-foreground uppercase tracking-[0.2em] font-medium">
                {t('dashboard.login.email_label')}
              </label>
              <div className={`relative rounded-xl transition-all duration-300 ${
                focusedField === 'email' ? 'ring-1 ring-accent/30' : ''
              }`}>
                <Mail className={`absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 transition-colors duration-300 ${
                  focusedField === 'email' ? 'text-accent' : 'text-muted-foreground'
                }`} />
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onFocus={() => setFocusedField('email')}
                  onBlur={() => setFocusedField(null)}
                  placeholder="admin@amclean.be"
                  required
                  className="h-12 pl-11 bg-background/50 border-white/10 text-foreground placeholder:text-white/20 rounded-xl focus-visible:ring-0 focus-visible:border-accent/40"
                />
              </div>
            </div>

            {/* Password field */}
            <div className="space-y-2">
              <label className="text-[10px] text-muted-foreground uppercase tracking-[0.2em] font-medium">
                {t('dashboard.login.password_label')}
              </label>
              <div className={`relative rounded-xl transition-all duration-300 ${
                focusedField === 'password' ? 'ring-1 ring-accent/30' : ''
              }`}>
                <Lock className={`absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 transition-colors duration-300 ${
                  focusedField === 'password' ? 'text-accent' : 'text-muted-foreground'
                }`} />
                <Input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onFocus={() => setFocusedField('password')}
                  onBlur={() => setFocusedField(null)}
                  placeholder="••••••••"
                  required
                  className="h-12 pl-11 pr-11 bg-background/50 border-white/10 text-foreground placeholder:text-white/20 rounded-xl focus-visible:ring-0 focus-visible:border-accent/40"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Submit button */}
            <motion.button
              type="submit"
              disabled={isLoading}
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.99 }}
              className="w-full h-12 bg-accent hover:bg-accent/90 text-accent-foreground font-medium tracking-wider uppercase text-xs rounded-xl flex items-center justify-center gap-2 transition-all duration-300 disabled:opacity-50 relative overflow-hidden group"
            >
              {isLoading ? (
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                  className="w-5 h-5 border-2 border-accent-foreground border-t-transparent rounded-full"
                />
              ) : (
                <>
                  {t('dashboard.login.button')}
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                </>
              )}
              {/* Shine effect */}
              <div className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-700 bg-gradient-to-r from-transparent via-white/10 to-transparent" />
            </motion.button>
          </motion.form>

          {/* Footer */}
          <motion.p 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.7 }}
            className="text-center text-[10px] text-muted-foreground/50 mt-4 tracking-wider uppercase"
          >
            {t('dashboard.login.footer')}
          </motion.p>
        </div>
      </motion.div>
    </div>
  );
};

export default AdminLogin;
