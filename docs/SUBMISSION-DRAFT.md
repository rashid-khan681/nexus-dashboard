# Submission drafts

> Replace every [bracket] with a real value. Delete any sentence that is not true when you submit.

## A. "What did you learn and how did your idea create an impact?" (under 300 words)

Nexus Prime started as a dashboard that looked impressive but was not honest: parts of it were simulated. I rebuilt it so that every number on screen is measured, and that taught me more than any tutorial.

**Idea and impact.** Small teams running payment or e-commerce services drown in repeated alerts, so real incidents get missed. Nexus Prime opens an alert only after 3 consecutive bad samples, resolves it after 5 good ones, merges repeats into one alert and shows the reduction on screen. In my tests, [X] threshold breaches became [Y] alerts. Today it monitors a single host, and the System tab states exactly what is and is not measured.

**What I learned.**
- Containers: multi-stage builds, non-root users, healthchecks, and a Postgres volume mistake that silently loses data.
- One entry point: nginx routes the frontend, REST API and WebSockets on one port, the pattern Elastic Beanstalk expects for Docker Compose.
- Deployment reality: an Apple-silicon laptop builds arm64 images but EC2 needs amd64, and Beanstalk passes environment properties through a generated .env file.
- Testing failure on purpose: I stopped the database and the system raised an alert and recovered without crashing.
- Honest AI: answers are validated against recorded evidence. If a model invents a number, the answer is rejected and a labelled rules-only analysis is shown.

**Next.** External endpoint health checks, automated deployment from GitHub Actions, automated tests and multi-host agents.

## B. LinkedIn post: today (rebuild + containers). Post only after your local `docker compose up` works.

Day [N] of building Nexus Prime for #BuildOnElasticBeanstalk 🚀

My first version looked great, but parts of it were simulated. So I rebuilt it honestly: every metric is now measured, and the alert engine merges repeated breaches into one incident, so small teams stop drowning in noise.

Today: Dockerised the whole stack (multi-stage builds, non-root users, healthchecks) and put nginx in front as a single entry point for the app, API and WebSockets.

Lesson: a dashboard you cannot trust is worse than no dashboard.

Repo: [GitHub link]
Thanks Shubham Londhe and TrainWithShubham for the push 🙌
#DevOps #Docker #AWS #ElasticBeanstalk #Nginx #BuildInPublic

## C. LinkedIn post: deployment day (post only after Beanstalk is actually Healthy)

Nexus Prime is now running on AWS Elastic Beanstalk 🎉

Docker Compose bundle, nginx as the single entry point, t3.small single instance, secrets through environment properties.

What went wrong first (and what I learned): [one real problem, for example arm64 vs amd64 images] → fixed by [your fix].

Next: GitHub Actions CI is green, and I am recording the walkthrough.
Repo: [GitHub link]
#BuildOnElasticBeanstalk #DevOps #AWS #Docker
