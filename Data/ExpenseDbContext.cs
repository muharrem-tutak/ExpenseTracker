using ExpenseTrackerApi.Models;
using Microsoft.EntityFrameworkCore;

namespace ExpenseTrackerApi.Data
{
    public class ExpenseDbContext : DbContext
    {
        public ExpenseDbContext(DbContextOptions<ExpenseDbContext> options)
            : base(options)
        {
        }

        public DbSet<Expense> Expenses { get; set; }
        protected override void OnModelCreating(ModelBuilder modelBuilder)
        {
            var expense = modelBuilder.Entity<Expense>();
            expense.Property(e => e.Title).HasMaxLength(100).IsRequired();
            expense.Property(e => e.Category).HasMaxLength(50).IsRequired();
            expense.Property(e => e.Amount).HasPrecision(18, 2);
            expense.Property(e => e.Date).HasColumnType("date");
        }
    }
}
