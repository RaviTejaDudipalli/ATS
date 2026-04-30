/* eslint-disable no-console */
require('dotenv').config();
const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function upsertUser({ email, password, role, profile }) {
  const passwordHash = await bcrypt.hash(password, 10);
  const user = await prisma.user.upsert({
    where: { email },
    update: {},
    create: { email, passwordHash, role },
  });

  if (role === 'RECRUITER') {
    await prisma.recruiter.upsert({
      where: { userId: user.id },
      update: profile,
      create: { userId: user.id, ...profile },
    });
  } else {
    await prisma.candidate.upsert({
      where: { userId: user.id },
      update: profile,
      create: { userId: user.id, ...profile },
    });
  }
  return user;
}

async function main() {
  const recruiterUser = await upsertUser({
    email: 'recruiter@demo.com',
    password: 'Recruiter#1',
    role: 'RECRUITER',
    profile: { fullName: 'Riley Recruiter', company: 'Northwind Labs', title: 'Head of Talent' },
  });

  await upsertUser({
    email: 'candidate@demo.com',
    password: 'Candidate#1',
    role: 'CANDIDATE',
    profile: {
      fullName: 'Casey Candidate',
      phone: '+1 555 0100',
      headline: 'Full-stack engineer',
      linkedinUrl: 'https://linkedin.com/in/casey',
      githubUrl: 'https://github.com/casey',
      location: 'Remote',
    },
  });

  const recruiter = await prisma.recruiter.findUniqueOrThrow({ where: { userId: recruiterUser.id } });

  const jobs = [
    {
      title: 'Senior Full-Stack Engineer',
      description:
        'We are looking for a senior full-stack engineer with strong experience in TypeScript, React, Node.js and PostgreSQL. You will lead the design of scalable web services and partner with product to ship customer-facing features.',
      location: 'San Francisco, CA',
      remote: true,
      type: 'FULL_TIME',
      status: 'OPEN',
      salaryMin: 160000,
      salaryMax: 210000,
      skills: 'typescript, react, nodejs, postgresql, prisma, aws, ci/cd, testing',
      minExperience: 5,
    },
    {
      title: 'Frontend Engineer (React)',
      description:
        'Join our design-engineering team to build delightful UI in Next.js, Tailwind CSS and Framer Motion. We value accessibility, performance, and great taste.',
      location: 'Remote',
      remote: true,
      type: 'FULL_TIME',
      status: 'OPEN',
      salaryMin: 120000,
      salaryMax: 160000,
      skills: 'react, nextjs, tailwind, framer-motion, accessibility, typescript',
      minExperience: 3,
    },
    {
      title: 'Backend Engineer (Node.js)',
      description:
        'Design and build APIs powering our applicant tracking platform. Experience with Express, Prisma and PostgreSQL preferred. You will own services end to end.',
      location: 'New York, NY',
      remote: false,
      type: 'FULL_TIME',
      status: 'OPEN',
      salaryMin: 130000,
      salaryMax: 175000,
      skills: 'nodejs, express, prisma, postgresql, redis, docker, jwt, rest',
      minExperience: 4,
    },
    {
      title: 'Product Designer',
      description:
        'Own the visual and interaction design of our core product surfaces. Strong portfolio and Figma skills required.',
      location: 'Remote',
      remote: true,
      type: 'CONTRACT',
      status: 'OPEN',
      salaryMin: 90000,
      salaryMax: 130000,
      skills: 'figma, ux, ui, prototyping, accessibility',
      minExperience: 3,
    },
  ];

  for (const job of jobs) {
    const existing = await prisma.job.findFirst({
      where: { title: job.title, recruiterId: recruiter.id },
    });
    if (existing) {
      await prisma.job.update({ where: { id: existing.id }, data: job });
    } else {
      await prisma.job.create({ data: { ...job, recruiterId: recruiter.id } });
    }
  }

  console.log('Seed complete:');
  console.log('  recruiter@demo.com / Recruiter#1');
  console.log('  candidate@demo.com / Candidate#1');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
