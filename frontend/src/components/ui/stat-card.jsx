'use client';

import { motion } from 'framer-motion';

export default function StatCard({ label, value, icon: Icon, accent = 'from-brand-500 to-purple-500' }) {
  return (
    <motion.div
      whileHover={{ y: -2 }}
      transition={{ type: 'spring', stiffness: 260, damping: 22 }}
      className="card relative overflow-hidden p-5"
    >
      <div className={`absolute -right-8 -top-8 h-24 w-24 rounded-full bg-gradient-to-br ${accent} opacity-20 blur-2xl`} />
      <div className="flex items-center justify-between">
        <span className="muted text-sm">{label}</span>
        {Icon && (
          <span className={`grid h-9 w-9 place-items-center rounded-lg bg-gradient-to-br ${accent} text-white`}>
            <Icon size={16} />
          </span>
        )}
      </div>
      <div className="mt-3 text-3xl font-semibold tracking-tight">{value}</div>
    </motion.div>
  );
}
